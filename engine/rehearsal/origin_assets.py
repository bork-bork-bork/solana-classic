"""Read-only original mint and escrow observation on one fresh private copy."""
from pathlib import Path
import json,os,shutil,socket,subprocess,time
import bootstrap_driver as driver
from cold_copy import inventory,copy_cold_ledger,sha
ROOT=Path('/data/bridge-origin-assets-v2')
SOURCE=Path('/data/bridge-v2-redemption-pending-v1')
def validate(m,r):
    assert m['scope']=='isolated-synthetic-bootstrap-v2' and m['ports']==driver.PORTS
    assert len(set(m['genesi']))==2 and all(g not in driver.FORBIDDEN for g in m['genesi'])
    assert r['state']=='passed' and r['processes']['allStopped'] and r['operation']['state']=='FINALIZED'
    assert r['settlementAccepted'] and r['genesi']==m['genesi']
    assert r['bridgeSBF_SHA256']==driver.ELF_SHA and r['sourceBinarySHA256']==driver.BIN_SHA
    assert r['globalBacking']['actualGenesisBackingVerified'] is False
    assert r['recovery']['originOutstandingUnits']==r['recovery']['nativeOutstandingUnits']==r['recovery']['originEscrowUnits']=='1950000'
def command(i):
    assert i==0
    port=driver.PORTS[i]
    return [str(driver.BIN),'--ledger',str(ROOT/('ledger-'+str(i))),'--rpc-port',str(port),'--faucet-port',str(port+2),'--gossip-port',str(23000+i*100),'--bind-address','127.0.0.1','--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),'--limit-ledger-size','50000','--quiet']
def ready(genesis,health,finalized,expected,minimum):
    return genesis==expected and health=='ok' and isinstance(finalized,int) and not isinstance(finalized,bool) and isinstance(minimum,int) and not isinstance(minimum,bool) and 0<=minimum<=finalized

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists() and all(not (ROOT/('ledger-'+str(i))).exists() for i in range(2))
    m=json.loads((SOURCE/'private-input.json').read_text());r=json.loads((SOURCE/'public-result.json').read_text());validate(m,r)
    assert sha(driver.BIN)==driver.BIN_SHA and sha(ROOT/'bridge.so')==driver.ELF_SHA
    sources=json.loads((ROOT/'public-source-hashes.json').read_text());assert all(sha(ROOT/n)==h for n,h in sources.items())
    pins=json.loads((ROOT/'reviewed-pins-public.json').read_text());assert pins['state']=='passed' and pins['processes']['allStopped'] and pins['realLedgerPinnedJournalIntegration'] is True
    assert [pins['pinAdmissions'][0][side]['genesis'] for side in ['source','destination']]==m['genesi']
    minimum=[pins['pinAdmissions'][0][side]['contextSlot'] for side in ['source','destination']];assert all(isinstance(s,int) and not isinstance(s,bool) and s>=0 for s in minimum)
    for proc in Path('/proc').glob('[0-9]*'):
        try:first=(proc/'cmdline').read_bytes().split(b'\0')[0]
        except OSError:continue
        assert first!=str(driver.BIN).encode(),'Another private validator is active'
    for port in driver.PORTS:
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    assert shutil.disk_usage('/data').free>2*1024**3
    cold=[inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)];input_hash=sha(SOURCE/'private-input.json')
    journal=SOURCE/'journal'/(r['operation']['id']+'.json');journal_hash=sha(journal)
    state={'scope':'One new private copy for original mint and escrow observation','state':'copying','starts':[],'stops':[],'canonicalNetworkChanged':False,'productionReady':False,'originalColdInventory':cold,'originalFixtureSHA256':input_hash,'originalJournalSHA256':journal_hash}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save()
    for i in range(1):copy_cold_ledger(SOURCE/('ledger-'+str(i)),ROOT/('ledger-'+str(i)))
    modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True);(modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
    shutil.copyfile(SOURCE/'public-result.json',ROOT/'prior-settlement-public.json')
    processes={};handles=[]
    try:
        state['state']='running';save()
        for i in range(1):
            log=(ROOT/('validator-'+str(i)+'-private.log')).open('ab');handles.append(log)
            p=subprocess.Popen(command(i),stdout=log,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
            until=time.monotonic()+180
            while time.monotonic()<until:
                if p.poll() is not None:raise RuntimeError('Copied validator exited; preserve private logs')
                try:
                    assert driver.rpc(driver.PORTS[i],'getGenesisHash')==m['genesi'][i]
                    if ready(driver.rpc(driver.PORTS[i],'getGenesisHash'),driver.rpc(driver.PORTS[i],'getHealth'),driver.rpc(driver.PORTS[i],'getSlot',[{'commitment':'finalized'}]),m['genesi'][i],minimum[i]):break
                except (OSError,ValueError,RuntimeError):pass
                time.sleep(2)
            else:raise RuntimeError('Copied validator readiness timed out')
            assert (Path('/proc')/str(p.pid)/'cmdline').read_bytes().split(b'\0')[:3]==[str(driver.BIN).encode(),b'--ledger',str(ROOT/('ledger-'+str(i))).encode()]
            forbidden=[str(SOURCE/('ledger-'+str(j))) for j in range(2)]
            assert not any(v in (Path('/proc')/str(p.pid)/'maps').read_text() for v in forbidden)
            for fd in (Path('/proc')/str(p.pid)/'fd').iterdir():
                try:target=os.readlink(fd)
                except OSError:continue
                assert not any(v in target for v in forbidden)
            state['starts'].append({'side':i,'genesisMatches':True,'originalLedgerPathsOpened':False,'retainedMinimumFinalizedSlot':minimum[i],'finalizedSlotAtReadiness':driver.rpc(driver.PORTS[i],'getSlot',[{'commitment':'finalized'}])});save()
        with (ROOT/'verification-private.log').open('xb') as log:subprocess.run(['node',str(ROOT/'observe-origin-assets.mjs')],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
        assert [inventory(SOURCE/('ledger-'+str(i)))[0] for i in range(2)]==cold and sha(SOURCE/'private-input.json')==input_hash and sha(journal)==journal_hash
        state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i,p in processes.items():
            try:state['stops'].append({'side':i,'signal':'SIGINT','returnCode':driver.stop(p),'applicationGracefulFlushVerified':False})
            except Exception:state['state']='failed'
        for h in handles:h.close()
        save()
    assert state['state']=='passed'
    result=json.loads((ROOT/'public-result.json').read_text());assert result['state']=='passed' and result['broadcasts']==0 and result['simulations']==0 and result['observation']['escrowCoversRecordedObligations'] and result['observation']['originEscrowUnits']=='1950000'
    result.update(processes={**state,'allStopped':True},sourceBinarySHA256=driver.BIN_SHA,uploadedSourceHashes=sources,originalLedgersUnchanged=True,originalFixtureUnchanged=True,originalJournalUnchanged=True,originalJournalSHA256=journal_hash,originalColdInventory=cold)
    result['checks'].append('Single copied process stopped; both original ledgers, fixture and finalized journal hashes unchanged')
    result['processOpenPathCheckScope']='Readiness fd/maps samples; not continuous host auditing'
    (ROOT/'public-result.json').write_text(json.dumps(result,indent=2));print(json.dumps({'state':'passed','checks':len(result['checks']),'allStopped':True,'broadcasts':0}))
if __name__=='__main__':main()
