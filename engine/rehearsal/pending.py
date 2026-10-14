"""Actual synthetic pending-claim recovery on the separate private worker.

Uses recovery.py helpers; preserves a new cold archive, starts only retained
private test ledgers, and stages an RPC outage after the harness (not client)
has observed finalization. This is not an unfinalized fork/crash experiment.
"""
from pathlib import Path
import json,os,signal,socket,subprocess,time
import recovery as driver

ROOT=Path('/data/bridge-pending-v1')
SOURCE=driver.SOURCE

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists(),'Do not replay a pending attempt'
    manifest=json.loads((SOURCE/'private-input.json').read_text())
    driver.validate(manifest,json.loads((SOURCE/'public-result.json').read_text()),json.loads((SOURCE/'attempt.json').read_text()))
    assert driver.sha(driver.BIN)==driver.BIN_SHA
    for proc in Path('/proc').glob('[0-9]*'):
        try:first=(proc/'cmdline').read_bytes().split(b'\0')[0]
        except OSError:continue
        assert first!=str(driver.BIN).encode(),'Another private validator is active'
    for port in manifest['ports']:
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    state={'scope':'private synthetic pending native-claim recovery','state':'archiving','canonicalNetworkChanged':False,'productionReady':False,'starts':[],'stops':[]}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save();archive=ROOT/'ledgers-before-private.tar'
    subprocess.run(['tar','-cf',str(archive),'ledger-0','ledger-1','private-input.json','public-result.json'],cwd=SOURCE,check=True,timeout=180)
    state['coldArchive']={'sha256':driver.sha(archive),'bytes':archive.stat().st_size,'scope':'Retained stopped private ledgers before new synthetic lock; not a tested cold restore'};save()
    modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
    (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
    (modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
    processes={};handles=[]
    def start(i,minimum=0):
        log=(ROOT/('validator-'+str(i)+'-private.log')).open('ab');handles.append(log)
        p=subprocess.Popen(driver.command(i,manifest),stdout=log,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
        until=time.monotonic()+180
        while time.monotonic()<until:
            if p.poll() is not None:raise RuntimeError('Private pending validator exited; retain logs')
            try:
                assert driver.rpc(manifest['ports'][i],'getGenesisHash')==manifest['genesi'][i]
                if driver.rpc(manifest['ports'][i],'getHealth')=='ok' and driver.rpc(manifest['ports'][i],'getSlot',[{'commitment':'finalized'}])>=minimum:break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Private readiness timed out')
        state['starts'].append({'side':i,'genesisMatches':True,'minimumFinalizedSlot':minimum});save()
    def halt(i):
        code=driver.stop(processes.pop(i));state['stops'].append({'side':i,'signal':'SIGINT','returnCode':code,'applicationGracefulFlushVerified':False});save()
    def phase(name):
        with (ROOT/'pending-private.log').open('ab') as log:
            subprocess.run(['node',str(ROOT/'pending.mjs'),name],cwd='/app',stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
    try:
        state['state']='running';save();start(0);start(1);phase('submit')
        report=json.loads((ROOT/'public-result.json').read_text());signature=report['claimSignature']
        # This separate fault orchestrator waits for finality to preserve a
        # deterministic recovery case. The client journal remains unconfirmed.
        until=time.monotonic()+120;slot=None
        while time.monotonic()<until:
            status=driver.rpc(manifest['ports'][1],'getSignatureStatuses',[[signature],{'searchTransactionHistory':True}])['value'][0]
            if status and status.get('err'):raise RuntimeError('Synthetic claim failed')
            if status and status.get('confirmationStatus')=='finalized':slot=status['slot'];break
            time.sleep(2)
        assert slot is not None,'Fault staging finality timed out'
        state['faultHarnessObservedFinality']={'slot':slot,'clientJournalStillUnconfirmed':True};save()
        halt(1);phase('outage');start(1,slot);phase('recover');state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i in list(processes):
            try:halt(i)
            except Exception:state['state']='failed';save();raise
        for handle in handles:handle.close()
        save()
    assert state['state']=='passed'
    report=json.loads((ROOT/'public-result.json').read_text());assert report['state']=='passed'
    report['coldArchive']=state['coldArchive'];report['faultHarnessObservedFinality']=state['faultHarnessObservedFinality']
    report['processRecovery']={'starts':state['starts'],'stops':state['stops'],'allStopped':True};report['sourceBinarySHA256']=driver.BIN_SHA
    report['remainingWork']=['Origin redemption journal','Unknown landing/expired transaction and pruning drill','Actual pre-finalized fork and hard-crash/cold-restore drills','Production code/authority pinning, independent verifiers/custody and security review','Backed bootstrap and full-validator consensus']
    (ROOT/'public-result.json').write_text(json.dumps(report,indent=2));print(json.dumps({'state':'passed','checks':len(report['checks']),'claimBroadcasts':report['claimBroadcasts'],'canonicalNetworkChanged':False}))

if __name__=='__main__':main()
