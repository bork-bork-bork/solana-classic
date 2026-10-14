"""One synthetic V2 observed-pending original-redemption SIGKILL on new ledger copies only."""
from pathlib import Path
import json,os,re,shutil,signal,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import inventory,copy_cold_ledger,sha

ROOT=Path('/data/bridge-v2-redemption-pending-v1')
SOURCE=Path('/data/bridge-v2-pending-crash-v1')
FIXTURE=SOURCE

def validate(manifest,earlier,attempt):
    assert manifest['scope']=='isolated-synthetic-bootstrap-v2' and manifest['ports']==driver.PORTS
    assert earlier['state']==attempt['state']=='passed' and earlier['genesi']==manifest['genesi']
    assert earlier['processes']['allStopped'] and len(attempt['stops'])==2 and len(attempt['crashes'])==1
    assert all(s['returnCode'] in (0,-2) for s in attempt['stops']) and attempt['crashes'][0]['returnCode']==-9
    assert earlier['operation']['state']=='FINALIZED' and earlier['settlementAccepted']
    assert re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}',earlier['operation']['id'])
    assert earlier['recovery']['originOutstandingUnits']==earlier['recovery']['nativeOutstandingUnits']=='1960000'
    assert earlier['recovery']['originEscrowUnits']=='1960000' and earlier['recovery']['originUserUnits']=='40000'
    assert earlier['recovery']['reserveNativeUnits']=='42000000' and earlier['recovery']['protectedFloorNativeUnits']=='2000000'
    assert earlier['originalLedgersUnchanged'] and earlier['originalFixtureUnchanged']
    assert len(set(manifest['genesi']))==2 and all(g not in driver.FORBIDDEN for g in manifest['genesi'])
    assert earlier['bridgeSBF_SHA256']==driver.ELF_SHA and earlier['sourceBinarySHA256']==driver.BIN_SHA
    assert earlier['globalBacking']['actualGenesisBackingVerified'] is False

def command(i):
    port=driver.PORTS[i]
    return [str(driver.BIN),'--ledger',str(ROOT/('ledger-'+str(i))),'--rpc-port',str(port),
        '--faucet-port',str(port+2),'--gossip-port',str(23000+i*100),'--bind-address','127.0.0.1',
        '--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),'--limit-ledger-size','50000','--quiet']

def validate_crash(raw,status,processed,finalized):
    assert raw.split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/'ledger-0').encode()]
    assert isinstance(processed,int) and isinstance(finalized,int) and processed>finalized
    assert isinstance(status,dict),'An observed pending signature is required before kill'
    assert status['err'] is None and status['confirmationStatus'] in ('processed','confirmed')
    assert isinstance(status['slot'],int) and not isinstance(status['slot'],bool) and finalized<status['slot']<=processed,'Claim is already finalized or beyond observed processed slot'

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
    original=[inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)];fixture_hash=sha(FIXTURE/'private-input.json')
    prior_journal=SOURCE/'journal'/(earlier['operation']['id']+'.json');journal_hash=sha(prior_journal)
    state={'scope':'new synthetic V2 original-redemption pre-finality SIGKILL on copies','state':'copying','starts':[],'crashes':[],'stops':[],'canonicalNetworkChanged':False,'productionReady':False}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save()
    for i in range(2):copy_cold_ledger(SOURCE/('ledger-'+str(i)),ROOT/('ledger-'+str(i)))
    shutil.copyfile(FIXTURE/'private-input.json',ROOT/'private-input.json');shutil.copyfile(SOURCE/'baseline-proof-public.json',ROOT/'baseline-proof-public.json');shutil.copyfile(SOURCE/'public-result.json',ROOT/'prior-settlement-public.json')
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
        forbidden=[str(parent/('ledger-'+str(j))) for parent in [SOURCE,Path('/data/bridge-bootstrap-v2'),Path('/data/bridge-cold-restore-v2/restored')] for j in range(2)]
        assert not any(s in (Path('/proc')/str(p.pid)/'maps').read_text() for s in forbidden)
        for fd in (Path('/proc')/str(p.pid)/'fd').iterdir():
            try:target=os.readlink(fd)
            except OSError:continue
            assert not any(s in target for s in forbidden)
        state['starts'].append({'side':i,'genesisMatches':True,'originalLedgerPathsOpened':False});save()
    def phase(name):
        with (ROOT/'verification-private.log').open('ab') as log:subprocess.run(['node',str(ROOT/'redemption-pending.mjs'),name],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,timeout=240,check=True)
    try:
        state['state']='running';save();start(0);start(1);phase('submit')
        report=json.loads((ROOT/'public-result.json').read_text());assert report['claimBroadcasts']==1 and report['clientConfirmationWithheld']
        p=processes[0];assert p.poll() is None and os.getpgid(p.pid)==p.pid
        until=time.monotonic()+10;status=None
        while time.monotonic()<until:
            status=driver.rpc(driver.PORTS[0],'getSignatureStatuses',[[report['claimSignature']],{'searchTransactionHistory':True}])['value'][0]
            if status is not None:break
            time.sleep(0.1)
        finalized_height=driver.rpc(driver.PORTS[0],'getBlockHeight',[{'commitment':'finalized'}])
        processed=driver.rpc(driver.PORTS[0],'getSlot',[{'commitment':'processed'}]);finalized=driver.rpc(driver.PORTS[0],'getSlot',[{'commitment':'finalized'}])
        assert isinstance(finalized_height,int) and not isinstance(finalized_height,bool) and finalized_height<=report['claimExpiry']['lastValidBlockHeight'],'Claim expired before fault; do not accept positive crash scope'
        validate_crash((Path('/proc')/str(p.pid)/'cmdline').read_bytes(),status,processed,finalized)
        os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=30);assert p.returncode==-signal.SIGKILL;processes.pop(0)
        state['crashes'].append({'side':0,'signal':'SIGKILL','returnCode':p.returncode,'claimStatusBeforeKill':status,'destinationFinalizedHeightBeforeKill':finalized_height,'signedLastValidBlockHeight':report['claimExpiry']['lastValidBlockHeight'],'processedSlotBeforeKill':processed,'finalizedSlotBeforeKill':finalized,'waitedForClaimFinality':False,'knownFinalizedBeforeFault':False,'competingForkTested':False,'physicalPowerLossTested':False});save()
        phase('outage');start(0);phase('recover');state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i,p in processes.items():
            try:state['stops'].append({'side':i,'signal':'SIGINT','returnCode':driver.stop(p),'applicationGracefulFlushVerified':False})
            except Exception:state['state']='failed'
        for h in handles:h.close()
        save()
    assert state['state']=='passed' and len(state['crashes'])==1 and len(state['stops'])==2
    assert [inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)]==original and sha(FIXTURE/'private-input.json')==fixture_hash
    assert sha(prior_journal)==journal_hash,'Previous signed native journal changed'
    report=json.loads((ROOT/'public-result.json').read_text());assert report['state']=='passed' and report['operation']['state']=='FINALIZED' and report['settlementAccepted']
    report['checks']+=['Actual pre-finality destination SIGKILL exit-9, three copy starts stopped and original ledgers/fixture unchanged']
    report['processes']={**state,'allStopped':True};report['originalColdInventory']=original;report['originalLedgersUnchanged']=True;report['originalFixtureUnchanged']=True
    report['priorNativeJournalUnchanged']=True;report['priorNativeJournalSHA256']=journal_hash
    report['sourceBinarySHA256']=driver.BIN_SHA;report['bridgeSBF_SHA256']=driver.ELF_SHA;report['uploadedSourceHashes']=sources
    report['processOpenPathCheckScope']='Readiness /proc fd/maps samples only; not continuous host auditing'
    report['priorAttemptsPreserved']=['/data/bridge-v2-redemption-crash-v1','/data/bridge-v2-redemption-crash-v2']
    report['remainingWork']=['Competing fork/reorg, deliberate expiry/pruning and physical host failure','Production code/authority pins, custody, independent verifiers and security review','Complete funded backing and capable full-validator hosting/operators']
    (ROOT/'public-result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'state':'passed','checks':len(report['checks']),'claimBroadcasts':report['claimBroadcasts'],'recoveredState':report['operation']['state'],'canonicalNetworkChanged':False}))

if __name__=='__main__':main()
