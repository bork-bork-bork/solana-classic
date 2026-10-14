"""Fresh V2 bridge wire/state rehearsal on the separate private worker.

The declared two-row native budget is synthetic, not the test-validator's
complete inventory. This cannot accept mainnet backing, consensus or custody.
No existing private/canonical ledger is opened, reset or upgraded.
"""
from pathlib import Path
import hashlib,json,os,signal,socket,subprocess,time,urllib.request

ROOT=Path('/data/bridge-bootstrap-v2')
BIN=Path('/data/target/release/solana-test-validator')
BIN_SHA='3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a'
ELF_SHA='556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53'
TOKEN_SHA='a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68'
FORBIDDEN={'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'}
PORTS=[20899,21899]

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rpc(port,method,params=None):
    r=urllib.request.Request('http://127.0.0.1:'+str(port),data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params or []}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(r,timeout=4) as response:d=json.load(response)
    if d.get('jsonrpc')!='2.0' or d.get('id')!=1 or 'error' in d:raise RuntimeError('Private RPC unavailable')
    return d['result']
def command(i,payer):
    return [str(BIN),'--ledger',str(ROOT/('ledger-'+str(i))),'--rpc-port',str(PORTS[i]),
        '--faucet-port',str(PORTS[i]+2),'--gossip-port',str(23000+i*100),
        '--bind-address','127.0.0.1','--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),
        '--limit-ledger-size','50000','--mint',payer,'--quiet','--bpf-program',
        'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',str(ROOT/'token2022.so')]
def validate_genesis(genesis,seen):
    assert isinstance(genesis,str) and genesis and genesis not in FORBIDDEN and genesis not in seen,'Forbidden or repeated identity'
def stop(p):
    if p.poll() is None:
        os.killpg(p.pid,signal.SIGINT)
        try:p.wait(timeout=45)
        except subprocess.TimeoutExpired:
            os.killpg(p.pid,signal.SIGKILL);p.wait();raise RuntimeError('Private stop exceeded timeout')
    assert p.returncode in (0,-signal.SIGINT),'Unexpected private process exit'
    return p.returncode

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists(),'Do not replay an attempt'
    assert not any((ROOT/('ledger-'+str(i))).exists() for i in range(2)),'Fresh ledgers required'
    assert sha(BIN)==BIN_SHA and '3.0.14' in subprocess.check_output([str(BIN),'--version'],text=True)
    for path,expected in [(ROOT/'bridge.so',ELF_SHA),(ROOT/'token2022.so',TOKEN_SHA)]:assert sha(path)==expected
    sources=json.loads((ROOT/'public-source-hashes.json').read_text())
    assert sources and all(sha(ROOT/p)==expected for p,expected in sources.items()),'Uploaded source changed'
    for proc in Path('/proc').glob('[0-9]*'):
        try:first=(proc/'cmdline').read_bytes().split(b'\0')[0]
        except OSError:continue
        assert first!=str(BIN).encode(),'Another private validator is active'
    for port in PORTS:
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
    (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
    (modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
    # Private fixture keys are generated only on the worker and never returned.
    script="""const fs=require('fs'),{Keypair}=require('@solana/web3.js');const keys={};for(const n of ['payer','originUser','nativeUser','program0','program1',...Array.from({length:5},(_,i)=>'committee'+i)])keys[n]=Array.from(Keypair.generate().secretKey);const pub=n=>Keypair.fromSecretKey(Uint8Array.from(keys[n])).publicKey.toBase58();fs.writeFileSync('private-input.json',JSON.stringify({scope:'isolated-synthetic-bootstrap-v2',keys,programs:[pub('program0'),pub('program1')],payer:pub('payer'),bridge:Keypair.generate().publicKey.toBase58(),ports:[20899,21899],genesi:[]}),{mode:384});"""
    subprocess.run(['node','-e',script],cwd=ROOT,check=True)
    data=json.loads((ROOT/'private-input.json').read_text())
    for name in ['payer','program0','program1']:(ROOT/(name+'-private.json')).write_text(json.dumps(data['keys'][name]))
    state={'scope':'fresh private V2 bridge execution, synthetic budget; not full backing','state':'starting','canonicalNetworkChanged':False,'productionReady':False,'starts':[],'stops':[]}
    def save():(ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save();processes={};handles=[]
    try:
        for i,port in enumerate(PORTS):
            out=(ROOT/('validator-'+str(i)+'-private.log')).open('ab');handles.append(out)
            p=subprocess.Popen(command(i,data['payer']),stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
            until=time.monotonic()+180
            while time.monotonic()<until:
                if p.poll() is not None:raise RuntimeError('New private validator exited; inspect retained log')
                try:
                    g=rpc(port,'getGenesisHash');validate_genesis(g,data['genesi'])
                    if rpc(port,'getHealth')=='ok':data['genesi'].append(g);break
                except (OSError,ValueError,RuntimeError):pass
                time.sleep(2)
            else:raise RuntimeError('New private validator readiness timed out')
            state['starts'].append({'side':i,'genesis':g});save()
            assert rpc(port,'getGenesisHash')==g
            with (ROOT/('deploy-'+str(i)+'-private.log')).open('ab') as log:
                subprocess.run(['/data/target/release/solana','--url','http://127.0.0.1:'+str(port),'--keypair',str(ROOT/'payer-private.json'),'--commitment','finalized','program','deploy',str(ROOT/'bridge.so'),'--program-id',str(ROOT/('program'+str(i)+'-private.json')),'--upgrade-authority',str(ROOT/'payer-private.json')],stdout=log,stderr=subprocess.STDOUT,check=True,timeout=180)
        # Python JSON preserves this >2^53 integer exactly. It is recorded as a
        # string, never rounded through the JavaScript RPC number decoder.
        total=rpc(PORTS[1],'getSupply',[{'commitment':'finalized'}])['value']['total']
        assert isinstance(total,int) and total>2_000_000_000
        data['nativeGlobalSupplyUnitsAtStart']=str(total)
        (ROOT/'private-input.json').write_text(json.dumps(data));state['state']='running';save()
        with (ROOT/'integration-private.log').open('ab') as log:
            subprocess.run(['node',str(ROOT/'bridge/rehearsal/bootstrap.mjs')],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=1200)
        report=json.loads((ROOT/'public-result.json').read_text());assert report['state']=='passed'
        state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i,p in processes.items():
            try:state['stops'].append({'side':i,'signal':'SIGINT','returnCode':stop(p),'applicationGracefulFlushVerified':False})
            except Exception:
                state['state']='failed';state['stops'].append({'side':i,'returnCode':p.poll(),'stopAccepted':False})
        for handle in handles:handle.close()
        save()
    assert state['state']=='passed'
    report['sourceBinarySHA256']=BIN_SHA;report['bridgeSBF_SHA256']=ELF_SHA
    report['uploadedSourceHashes']=sources;report['processes']={'starts':state['starts'],'stops':state['stops'],'allStopped':True}
    report['remainingWork']=['Actual complete activation inventory and finalized backing/custody','Full Agave validators/consensus and independent operators','Unknown landing, fork/reorg, crash/cold-restore and security review']
    (ROOT/'public-result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'state':'passed','checks':len(report['checks']),'globalBackingVerified':False,'canonicalNetworkChanged':False}))

if __name__=='__main__':main()
