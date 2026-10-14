"""Archive/extract/restore stopped private V2 bridge state; zero broadcasts.

Original ledgers are read only for cold copying/hashes and never opened by a
validator. Working and restored ledgers are new private copies on one host.
"""
from pathlib import Path
import json,os,shutil,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import copy_cold_ledger,inventory,archive_backup,extract_backup,sha

ROOT=Path('/data/bridge-cold-restore-v2')
SOURCE=Path('/data/bridge-bootstrap-v2')

def validate(manifest,report,attempt):
    assert manifest['scope']=='isolated-synthetic-bootstrap-v2' and report['state']=='passed' and attempt['state']=='passed'
    assert report['processes']['allStopped'] and len(attempt['stops'])==2 and all(s['returnCode'] in (0,-2) for s in attempt['stops'])
    assert manifest['ports']==driver.PORTS and manifest['genesi']==report['genesi']
    assert len(manifest['genesi'])==2 and len(set(manifest['genesi']))==2
    assert all(g not in driver.FORBIDDEN for g in manifest['genesi'])
    assert report['bridgeSBF_SHA256']==driver.ELF_SHA and report['reconciliation']['nativeOutstandingOriginUnits']=='1950000'
    assert report['globalBacking']['completeInventoryVerified'] is False and report['globalBacking']['actualGenesisBackingVerified'] is False

def command(i,ledger):
    assert ledger in [ROOT/group/('ledger-'+str(i)) for group in ['working','restored']],'Only new copied ledgers can run'
    port=driver.PORTS[i]
    return [str(driver.BIN),'--ledger',str(ledger),'--rpc-port',str(port),'--faucet-port',str(port+2),
        '--gossip-port',str(23000+i*100),'--bind-address','127.0.0.1',
        '--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),'--limit-ledger-size','50000','--quiet']

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists(),'New private attempt required'
    assert not any((ROOT/group).exists() for group in ['working','backup','extracted','restored'])
    manifest=json.loads((SOURCE/'private-input.json').read_text());earlier=json.loads((SOURCE/'public-result.json').read_text())
    validate(manifest,earlier,json.loads((SOURCE/'attempt.json').read_text()))
    assert sha(driver.BIN)==driver.BIN_SHA and sha(ROOT/'bridge.so')==driver.ELF_SHA
    sources=json.loads((ROOT/'public-source-hashes.json').read_text());assert all(sha(ROOT/p)==h for p,h in sources.items())
    for proc in Path('/proc').glob('[0-9]*'):
        try:first=(proc/'cmdline').read_bytes().split(b'\0')[0]
        except OSError:continue
        assert first!=str(driver.BIN).encode(),'Another private validator is active'
    for port in driver.PORTS:
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    assert shutil.disk_usage('/data').free>4*1024**3,'Insufficient private copy capacity'
    state={'scope':'private V2 bridge cold archive extraction and copied-ledger restore','state':'copying','canonicalNetworkChanged':False,'productionReady':False,'starts':[],'stops':[]}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save();original=[inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)]
    state['originalColdInventory']=original;save()
    for i in range(2):copy_cold_ledger(SOURCE/('ledger-'+str(i)),ROOT/'working'/('ledger-'+str(i)))
    modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
    (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
    (modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
    processes={};handles=[]
    def start(group,i,minimum=0):
        out=(ROOT/(group+'-'+str(i)+'-private.log')).open('ab');handles.append(out)
        p=subprocess.Popen(command(i,ROOT/group/('ledger-'+str(i))),stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
        until=time.monotonic()+180
        while time.monotonic()<until:
            if p.poll() is not None:raise RuntimeError('Copied private validator exited; inspect retained log')
            try:
                assert driver.rpc(driver.PORTS[i],'getGenesisHash')==manifest['genesi'][i],'Copied genesis changed'
                if driver.rpc(driver.PORTS[i],'getHealth')=='ok' and driver.rpc(driver.PORTS[i],'getSlot',[{'commitment':'finalized'}])>=minimum:break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Copied private readiness timed out')
        # Prove restored processes do not mmap/open account files in original
        # or working ledgers. Shared binary/library paths are allowed.
        forbidden=[str(SOURCE/('ledger-'+str(j))) for j in range(2)]
        if group=='restored':forbidden += [str(ROOT/'working'/('ledger-'+str(j))) for j in range(2)]
        maps=Path('/proc')/str(p.pid)/'maps';assert not any(s in maps.read_text() for s in forbidden)
        for fd in (Path('/proc')/str(p.pid)/'fd').iterdir():
            try:target=os.readlink(fd)
            except OSError:continue
            assert not any(s in target for s in forbidden),'Process opened forbidden original account path'
        state['starts'].append({'group':group,'side':i,'minimumFinalizedSlot':minimum,'genesisMatches':True,'forbiddenLedgerPathsOpened':False});save()
    def halt(i):
        p=processes.pop(i);code=driver.stop(p);state['stops'].append({'side':i,'signal':'SIGINT','returnCode':code,'applicationGracefulFlushVerified':False});save()
    def phase(name):
        with (ROOT/'verification-private.log').open('ab') as log:subprocess.run(['node',str(ROOT/'cold-restore.mjs'),name],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=180)
    try:
        state['state']='baseline';save();start('working',0);start('working',1);phase('baseline');halt(0);halt(1)
        state['state']='archiving';save();backup=[]
        for i in range(2):backup.append(copy_cold_ledger(ROOT/'working'/('ledger-'+str(i)),ROOT/'backup'/('ledger-'+str(i))))
        info=archive_backup(ROOT/'backup',ROOT/'private-ledgers.tar')
        extracted=extract_backup(ROOT/'private-ledgers.tar',ROOT/'extracted',info['sha256']);assert extracted==backup,'Archive extraction changed ledger inventory'
        restored=[copy_cold_ledger(ROOT/'extracted'/('ledger-'+str(i)),ROOT/'restored'/('ledger-'+str(i))) for i in range(2)];assert restored==backup
        state['archive']={**info,'extractionVerified':True,'restoredInventoriesMatch':True,'snapshotLinksRebased':sum(v['links'] for v in restored)};save()
        baseline=json.loads((ROOT/'checkpoint-private.json').read_text());state['state']='restoring';save()
        start('restored',0,baseline[0]['contextSlot']);start('restored',1,baseline[1]['contextSlot']);phase('verify')
        assert [inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)]==original,'Original ledger bytes changed'
        state['originalLedgersUnchanged']=True;state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i in list(processes):
            try:halt(i)
            except Exception:state['state']='failed'
        for h in handles:h.close()
        save()
    assert state['state']=='passed'
    report=json.loads((ROOT/'public-result.json').read_text());assert report['state']=='passed'
    report['checks']+=['Stopped backup archive hash, complete extraction and cold inventories match before restored start',
        'All four copy processes have no original/forbidden working ledger account paths open or mapped',
        'Original two cold-ledger inventories remain unchanged; all four private processes stopped']
    report['coldArchive']=state['archive'];report['originalColdInventory']=original;report['originalLedgersUnchanged']=True
    report['processes']={'starts':state['starts'],'stops':state['stops'],'allStopped':True}
    report['sourceBinarySHA256']=driver.BIN_SHA;report['bridgeSBF_SHA256']=driver.ELF_SHA;report['uploadedSourceHashes']=sources
    report['remainingWork']=['Hard-crash/power-loss and pre-finalized fork/unknown-landing recovery','Complete actual funded mainnet inventory/backing and custody','Capable full-validator host, independent operators/verifiers and security review']
    (ROOT/'public-result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'state':'passed','checks':len(report['checks']),'broadcasts':0,'archiveExtractionVerified':True,'canonicalNetworkChanged':False}))

if __name__=='__main__':main()
