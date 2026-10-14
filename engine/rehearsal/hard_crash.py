"""SIGKILL only our private copied-ledger process groups, then verify recovery.

Known-finalized V2 state only: no new transactions, pending operation, competing
fork, kernel crash or physical power-loss proof. Original fixtures stay cold.
"""
from pathlib import Path
import json,os,shutil,signal,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import inventory,copy_cold_ledger,sha

ROOT=Path('/data/bridge-hard-crash-v2')
SOURCE=Path('/data/bridge-cold-restore-v2')
FIXTURE=Path('/data/bridge-bootstrap-v2')

def validate(manifest,earlier,attempt):
    assert manifest['scope']=='isolated-synthetic-bootstrap-v2' and manifest['ports']==driver.PORTS
    assert earlier['state']=='passed' and attempt['state']=='passed' and earlier['genesi']==manifest['genesi']
    assert earlier['processes']['allStopped'] and len(attempt['stops'])==4 and all(s['returnCode'] in (0,-2) for s in attempt['stops'])
    assert earlier['coldArchive']['extractionVerified'] and earlier['originalLedgersUnchanged']
    assert len(set(manifest['genesi']))==2 and all(g not in driver.FORBIDDEN for g in manifest['genesi'])
    assert earlier['bridgeSBF_SHA256']==driver.ELF_SHA
    assert earlier['globalBacking']['actualGenesisBackingVerified'] is False

def command(i):
    port=driver.PORTS[i]
    return [str(driver.BIN),'--ledger',str(ROOT/('ledger-'+str(i))),'--rpc-port',str(port),
        '--faucet-port',str(port+2),'--gossip-port',str(23000+i*100),'--bind-address','127.0.0.1',
        '--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),'--limit-ledger-size','50000','--quiet']

def validate_kill_command(raw,i):
    assert raw.split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/('ledger-'+str(i))).encode()],'SIGKILL requires our exact copied-ledger process'

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists(),'New private crash attempt required'
    assert all(not (ROOT/('ledger-'+str(i))).exists() for i in range(2))
    manifest=json.loads((FIXTURE/'private-input.json').read_text());earlier=json.loads((SOURCE/'public-result.json').read_text())
    validate(manifest,earlier,json.loads((SOURCE/'attempt.json').read_text()))
    assert sha(driver.BIN)==driver.BIN_SHA and sha(ROOT/'bridge.so')==driver.ELF_SHA
    sources=json.loads((ROOT/'public-source-hashes.json').read_text());assert all(sha(ROOT/p)==h for p,h in sources.items())
    for proc in Path('/proc').glob('[0-9]*'):
        try:first=(proc/'cmdline').read_bytes().split(b'\0')[0]
        except OSError:continue
        assert first!=str(driver.BIN).encode(),'Another private validator is active'
    for port in driver.PORTS:
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    assert shutil.disk_usage('/data').free>2*1024**3
    original=[inventory(SOURCE/'restored'/('ledger-'+str(i)))[0] for i in range(2)]
    state={'scope':'known-finalized private V2 SIGKILL process recovery on new ledger copies','state':'copying','canonicalNetworkChanged':False,'productionReady':False,'starts':[],'crashes':[],'stops':[]}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save()
    for i in range(2):copy_cold_ledger(SOURCE/'restored'/('ledger-'+str(i)),ROOT/('ledger-'+str(i)))
    modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
    (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
    (modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
    processes={};handles=[]
    def start(i,minimum=0):
        out=(ROOT/('validator-'+str(i)+'-private.log')).open('ab');handles.append(out)
        p=subprocess.Popen(command(i),stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
        until=time.monotonic()+180
        while time.monotonic()<until:
            if p.poll() is not None:raise RuntimeError('Copied crash-rehearsal validator exited; inspect retained log')
            try:
                assert driver.rpc(driver.PORTS[i],'getGenesisHash')==manifest['genesi'][i],'Copied genesis changed'
                if driver.rpc(driver.PORTS[i],'getHealth')=='ok' and driver.rpc(driver.PORTS[i],'getSlot',[{'commitment':'finalized'}])>=minimum:break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Private crash-recovery readiness timed out')
        validate_kill_command((Path('/proc')/str(p.pid)/'cmdline').read_bytes(),i)
        forbidden=[str(parent/('ledger-'+str(j))) for parent in [FIXTURE,SOURCE/'working',SOURCE/'restored'] for j in range(2)]
        assert not any(s in (Path('/proc')/str(p.pid)/'maps').read_text() for s in forbidden)
        for fd in (Path('/proc')/str(p.pid)/'fd').iterdir():
            try:target=os.readlink(fd)
            except OSError:continue
            assert not any(s in target for s in forbidden)
        state['starts'].append({'side':i,'minimumFinalizedSlot':minimum,'genesisMatches':True,'forbiddenOriginalLedgerPathsOpened':False});save()
    def crash(i,minimum):
        p=processes[i];assert p.poll() is None
        validate_kill_command((Path('/proc')/str(p.pid)/'cmdline').read_bytes(),i)
        assert os.getpgid(p.pid)==p.pid,'Only our new private process group can be killed'
        processed=driver.rpc(driver.PORTS[i],'getSlot',[{'commitment':'processed'}]);finalized=driver.rpc(driver.PORTS[i],'getSlot',[{'commitment':'finalized'}])
        assert isinstance(processed,int) and isinstance(finalized,int) and processed>finalized>=minimum,'Active private slot writing required'
        os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=30);assert p.returncode==-signal.SIGKILL
        processes.pop(i)
        state['crashes'].append({'side':i,'signal':'SIGKILL','returnCode':p.returncode,'processedSlotBeforeKill':processed,'finalizedSlotBeforeKill':finalized,'bridgeOperationsAlreadyFinalized':True,'pendingOperationTested':False,'physicalPowerLossTested':False});save()
    def phase(name):
        with (ROOT/'verification-private.log').open('ab') as log:subprocess.run(['node',str(ROOT/'hard-crash.mjs'),name],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=180)
    try:
        state['state']='baseline';save();start(0);start(1);phase('baseline');baseline=json.loads((ROOT/'checkpoint-private.json').read_text())
        state['state']='origin-crash';save();crash(0,baseline[0]['contextSlot']);phase('origin-outage');start(0,baseline[0]['contextSlot']);phase('origin-recovered')
        state['state']='native-crash';save();crash(1,baseline[1]['contextSlot']);phase('native-outage');start(1,baseline[1]['contextSlot']);phase('verify')
        state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i,p in processes.items():
            try:state['stops'].append({'side':i,'signal':'SIGINT','returnCode':driver.stop(p),'applicationGracefulFlushVerified':False})
            except Exception:state['state']='failed'
        for h in handles:h.close()
        save()
    assert state['state']=='passed' and len(state['crashes'])==len(state['stops'])==2
    assert [inventory(SOURCE/'restored'/('ledger-'+str(i)))[0] for i in range(2)]==original,'Original restored-ledger bytes changed'
    report=json.loads((ROOT/'public-result.json').read_text());assert report['state']=='passed'
    report['checks']+=['Both intended private process groups exited by actual SIGKILL while processed slots exceeded finalized slots',
        'Original stopped restored-ledger inventories unchanged; all four private starts stopped']
    report['originalColdInventory']=original;report['originalLedgersUnchanged']=True
    report['processes']={'starts':state['starts'],'crashes':state['crashes'],'stops':state['stops'],'allStopped':True}
    report['sourceBinarySHA256']=driver.BIN_SHA;report['bridgeSBF_SHA256']=driver.ELF_SHA;report['uploadedSourceHashes']=sources
    report['processOpenPathCheckScope']='At each startup readiness, /proc fd/maps sampled; not continuous host auditing.'
    report['remainingWork']=['Unknown landing/pending-operation crash, competing fork/reorg and physical host power loss','Actual complete funded inventory/backing, custody and source finality','Capable full-validator host, independent operators/verifiers and security review']
    (ROOT/'public-result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'state':'passed','checks':len(report['checks']),'actualSIGKILLs':2,'broadcasts':0,'canonicalNetworkChanged':False}))

if __name__=='__main__':main()
