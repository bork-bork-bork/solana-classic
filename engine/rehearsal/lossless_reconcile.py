"""Read-only reconciliation on new cold copies; retained V1 sources never opened."""
from pathlib import Path
import json,os,shutil,socket,subprocess,time
import recovery as driver
from cold_copy import inventory,copy_cold_ledger,sha

ROOT=Path('/data/bridge-journal-history-v1')
SOURCE=Path('/data/bridge-rehearsal-v1')
JOURNALS=[Path('/data/bridge-pending-v1'),Path('/data/bridge-redemption-v1')]
ELF_SHA='d9f3822ec9097f0a7ede222f20a68c3cba92b6fba46459af8ed0025652f2f9f7'

def validate(manifest,proofs,attempts,records):
    assert manifest['scope']=='isolated-synthetic-two-chain' and manifest['ports']==[20899,21899]
    assert len(manifest['genesi'])==len(set(manifest['genesi']))==2
    assert all(g not in driver.FORBIDDEN for g in manifest['genesi'])
    assert len(proofs)==len(attempts)==len(records)==2
    for i,(proof,attempt,record) in enumerate(zip(proofs,attempts,records)):
        assert proof['state']==attempt['state']=='passed' and proof['processRecovery']['allStopped']
        assert proof['genesi']==manifest['genesi'] and proof['operation']['id']==record['id']
        assert record['state']=='FINALIZED' and record['attempts']==1
        assert record['scope']==['isolated-native-claim','isolated-origin-redemption'][i]
        assert record['expectedGenesis']==manifest['genesi'][1-i]
        assert record['rpc']=='http://127.0.0.1:'+str(manifest['ports'][1-i])+'/'
        assert record['sourceRpc']=='http://127.0.0.1:'+str(manifest['ports'][i])+'/'

def command(i):
    port=[20899,21899][i]
    return [str(driver.BIN),'--ledger',str(ROOT/('ledger-'+str(i))),'--rpc-port',str(port),
        '--faucet-port',str(port+2),'--gossip-port',str(23000+i*100),'--bind-address','127.0.0.1',
        '--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),'--limit-ledger-size','50000','--quiet']

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists(),'New private attempt required'
    manifest=json.loads((SOURCE/'private-input.json').read_text())
    proofs=[json.loads((p/'public-result.json').read_text()) for p in JOURNALS]
    attempts=[json.loads((p/'attempt.json').read_text()) for p in JOURNALS]
    paths=[p/'journal'/(r['operation']['id']+'.json') for p,r in zip(JOURNALS,proofs)]
    records=[json.loads(p.read_text()) for p in paths];validate(manifest,proofs,attempts,records)
    assert sha(driver.BIN)==driver.BIN_SHA and sha(ROOT/'bridge.so')==ELF_SHA
    sources=json.loads((ROOT/'public-source-hashes.json').read_text());assert all(sha(ROOT/p)==h for p,h in sources.items())
    for proc in Path('/proc').glob('[0-9]*'):
        try:first=(proc/'cmdline').read_bytes().split(b'\0')[0]
        except OSError:continue
        assert first!=str(driver.BIN).encode(),'Another private validator is active'
    for port in manifest['ports']:
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    assert shutil.disk_usage('/data').free>2*1024**3
    original=[inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)]
    journal_hashes=[sha(p) for p in paths]
    state={'scope':'new copied finalized V1 journal lossless reconciliation','state':'copying','starts':[],'stops':[]}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save()
    for i in range(2):copy_cold_ledger(SOURCE/('ledger-'+str(i)),ROOT/('ledger-'+str(i)))
    inputs=[]
    for i,p in enumerate(paths):
        name='journal-'+str(i);(ROOT/name).mkdir(mode=0o700);shutil.copyfile(p,ROOT/name/p.name);(ROOT/name/p.name).chmod(0o600)
        inputs.append({'directory':name,'id':records[i]['id']})
    (ROOT/'journal-input-private.json').write_text(json.dumps(inputs))
    modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
    (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
    (modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
    processes={};handles=[]
    try:
        state['state']='running';save()
        for i in range(2):
            out=(ROOT/('validator-'+str(i)+'-private.log')).open('ab');handles.append(out)
            p=subprocess.Popen(command(i),stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
            until=time.monotonic()+180
            while time.monotonic()<until:
                if p.poll() is not None:raise RuntimeError('Copied validator exited; inspect retained log')
                try:
                    assert driver.rpc(manifest['ports'][i],'getGenesisHash')==manifest['genesi'][i]
                    if driver.rpc(manifest['ports'][i],'getHealth')=='ok':break
                except (OSError,ValueError,RuntimeError):pass
                time.sleep(2)
            else:raise RuntimeError('Copied validator readiness timed out')
            assert (Path('/proc')/str(p.pid)/'cmdline').read_bytes().split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/('ledger-'+str(i))).encode()]
            forbidden=[str(SOURCE/('ledger-'+str(j))) for j in range(2)]
            assert not any(s in (Path('/proc')/str(p.pid)/'maps').read_text() for s in forbidden)
            for fd in (Path('/proc')/str(p.pid)/'fd').iterdir():
                try:target=os.readlink(fd)
                except OSError:continue
                assert not any(s in target for s in forbidden)
            state['starts'].append({'side':i,'genesisMatches':True,'originalLedgerPathsOpened':False});save()
        with (ROOT/'verification-private.log').open('ab') as log:subprocess.run(['node',str(ROOT/'lossless-reconcile.mjs')],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
        state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i,p in processes.items():
            try:state['stops'].append({'side':i,'signal':'SIGINT','returnCode':driver.stop(p),'applicationGracefulFlushVerified':False})
            except Exception:state['state']='failed'
        for h in handles:h.close()
        save()
    assert state['state']=='passed' and len(state['stops'])==2
    assert [inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)]==original
    assert [sha(p) for p in paths]==journal_hashes
    report=json.loads((ROOT/'public-result.json').read_text());assert report['state']=='passed'
    report['checks']+=['Original stopped V1 ledgers and original journal bytes unchanged','Both newly started copied-ledger processes stopped; no source/live process restarted']
    report['originalColdInventory']=original;report['originalJournalSHA256']=journal_hashes;report['originalLedgersUnchanged']=True;report['originalJournalsUnchanged']=True
    report['processes']={**state,'allStopped':True};report['sourceBinarySHA256']=driver.BIN_SHA;report['bridgeSBF_SHA256']=ELF_SHA;report['uploadedSourceHashes']=sources
    report['processOpenPathCheckScope']='Readiness /proc fd/maps samples only; not continuous auditing'
    report['remainingWork']=['Fresh real large-native journal reconciliation for any operation with unavailable retained history','Unknown landing/pending crash and competing fork','Production code/authority pins, custody and independent verifiers/security review','Complete funded backing and capable full-validator hosting/operators']
    report['priorAttempt']={'root':'/data/bridge-lossless-reconcile-v1','state':'failed','reason':'Native original transaction history unavailable; exact-metadata admission stopped','allCopiedProcessesStopped':True,'acceptedAsMetadataProof':False}
    (ROOT/'public-result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'state':'passed','checks':len(report['checks']),'broadcasts':0,'canonicalNetworkChanged':False}))

if __name__=='__main__':main()
