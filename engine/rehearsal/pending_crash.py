"""One synthetic V2 pending-operation SIGKILL on new ledger copies only."""
from pathlib import Path
import json,os,shutil,signal,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import inventory,copy_cold_ledger,sha

ROOT=Path('/data/bridge-v2-pending-crash-v1')
SOURCE=Path('/data/bridge-cold-restore-v2')
FIXTURE=Path('/data/bridge-bootstrap-v2')

def validate(manifest,earlier,attempt):
    assert manifest['scope']=='isolated-synthetic-bootstrap-v2' and manifest['ports']==driver.PORTS
    assert earlier['state']==attempt['state']=='passed' and earlier['genesi']==manifest['genesi']
    assert earlier['processes']['allStopped'] and len(attempt['stops'])==4
    assert all(s['returnCode'] in (0,-2) for s in attempt['stops'])
    assert earlier['coldArchive']['extractionVerified'] and earlier['originalLedgersUnchanged']
    assert len(set(manifest['genesi']))==2 and all(g not in driver.FORBIDDEN for g in manifest['genesi'])
    assert earlier['bridgeSBF_SHA256']==driver.ELF_SHA and earlier['globalBacking']['actualGenesisBackingVerified'] is False

def command(i):
    port=driver.PORTS[i]
    return [str(driver.BIN),'--ledger',str(ROOT/('ledger-'+str(i))),'--rpc-port',str(port),
        '--faucet-port',str(port+2),'--gossip-port',str(23000+i*100),'--bind-address','127.0.0.1',
        '--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),'--limit-ledger-size','50000','--quiet']

def validate_crash(raw,status,processed,finalized):
    assert raw.split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/'ledger-1').encode()]
    assert isinstance(processed,int) and isinstance(finalized,int) and processed>finalized
    if status is not None:
        assert status['err'] is None and status['confirmationStatus'] in ('processed','confirmed')
        assert status['slot']>finalized,'Do not count an already-finalized operation as pending crash'

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists(),'New private attempt required'
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
    original=[inventory(SOURCE/'restored'/('ledger-'+str(i)))[0] for i in range(2)];fixture_hash=sha(FIXTURE/'private-input.json')
    state={'scope':'new synthetic V2 pre-finality pending-operation SIGKILL on copies','state':'copying','starts':[],'crashes':[],'stops':[],'canonicalNetworkChanged':False,'productionReady':False}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save()
    for i in range(2):copy_cold_ledger(SOURCE/'restored'/('ledger-'+str(i)),ROOT/('ledger-'+str(i)))
    shutil.copyfile(FIXTURE/'private-input.json',ROOT/'private-input.json');shutil.copyfile(FIXTURE/'public-result.json',ROOT/'baseline-proof-public.json')
    modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
    (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
    (modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
    processes={};handles=[]
    def start(i):
        out=(ROOT/('validator-'+str(i)+'-private.log')).open('ab');handles.append(out)
        p=subprocess.Popen(command(i),stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
        until=time.monotonic()+180
        while time.monotonic()<until:
            if p.poll() is not None:raise RuntimeError('Copied validator exited; retain private log')
            try:
                assert driver.rpc(driver.PORTS[i],'getGenesisHash')==manifest['genesi'][i]
                if driver.rpc(driver.PORTS[i],'getHealth')=='ok':break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Copied validator readiness timed out')
        assert (Path('/proc')/str(p.pid)/'cmdline').read_bytes().split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/('ledger-'+str(i))).encode()]
        forbidden=[str(parent/('ledger-'+str(j))) for parent in [FIXTURE,SOURCE/'working',SOURCE/'restored'] for j in range(2)]
        assert not any(s in (Path('/proc')/str(p.pid)/'maps').read_text() for s in forbidden)
        for fd in (Path('/proc')/str(p.pid)/'fd').iterdir():
            try:target=os.readlink(fd)
            except OSError:continue
            assert not any(s in target for s in forbidden)
        state['starts'].append({'side':i,'genesisMatches':True,'originalLedgerPathsOpened':False});save()
    def phase(name):
        with (ROOT/'verification-private.log').open('ab') as log:subprocess.run(['node',str(ROOT/'pending-crash.mjs'),name],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,timeout=240,check=True)
    try:
        state['state']='running';save();start(0);start(1);phase('submit')
        report=json.loads((ROOT/'public-result.json').read_text());assert report['claimBroadcasts']==1 and report['clientConfirmationWithheld']
        p=processes[1];assert p.poll() is None and os.getpgid(p.pid)==p.pid
        status=driver.rpc(driver.PORTS[1],'getSignatureStatuses',[[report['claimSignature']],{'searchTransactionHistory':True}])['value'][0]
        processed=driver.rpc(driver.PORTS[1],'getSlot',[{'commitment':'processed'}]);finalized=driver.rpc(driver.PORTS[1],'getSlot',[{'commitment':'finalized'}])
        validate_crash((Path('/proc')/str(p.pid)/'cmdline').read_bytes(),status,processed,finalized)
        os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=30);assert p.returncode==-signal.SIGKILL;processes.pop(1)
        state['crashes'].append({'side':1,'signal':'SIGKILL','returnCode':p.returncode,'claimStatusBeforeKill':status,'processedSlotBeforeKill':processed,'finalizedSlotBeforeKill':finalized,'waitedForClaimFinality':False,'knownFinalizedBeforeFault':False,'competingForkTested':False,'physicalPowerLossTested':False});save()
        phase('outage');start(1);phase('recover');state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i,p in processes.items():
            try:state['stops'].append({'side':i,'signal':'SIGINT','returnCode':driver.stop(p),'applicationGracefulFlushVerified':False})
            except Exception:state['state']='failed'
        for h in handles:h.close()
        save()
    assert state['state']=='passed' and len(state['crashes'])==1 and len(state['stops'])==2
    assert [inventory(SOURCE/'restored'/('ledger-'+str(i)))[0] for i in range(2)]==original and sha(FIXTURE/'private-input.json')==fixture_hash
    report=json.loads((ROOT/'public-result.json').read_text());assert report['state']=='passed'
    report['checks']+=['Actual pre-finality destination SIGKILL exit-9, three copy starts stopped and original ledgers/fixture unchanged']
    report['processes']={**state,'allStopped':True};report['originalColdInventory']=original;report['originalLedgersUnchanged']=True;report['originalFixtureUnchanged']=True
    report['sourceBinarySHA256']=driver.BIN_SHA;report['bridgeSBF_SHA256']=driver.ELF_SHA;report['uploadedSourceHashes']=sources
    report['processOpenPathCheckScope']='Readiness /proc fd/maps samples only; not continuous host auditing'
    report['remainingWork']=['Competing fork/reorg, physical host failure and two-direction pending fault coverage','Production code/authority pins, custody, independent verifiers and security review','Complete funded backing and capable full-validator hosting/operators']
    (ROOT/'public-result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'state':'passed','checks':len(report['checks']),'claimBroadcasts':report['claimBroadcasts'],'recoveredState':report['operation']['state'],'canonicalNetworkChanged':False}))

if __name__=='__main__':main()
