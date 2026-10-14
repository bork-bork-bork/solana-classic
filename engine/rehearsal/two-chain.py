"""Run disposable bridge ledgers on the separate Linux build worker.

No routes, canonical services or existing ledger files are changed. Inputs are
created inside this private directory, never exported in the public report.
"""
from pathlib import Path
import hashlib, json, os, signal, subprocess, time, urllib.request

ROOT = Path('/data/bridge-rehearsal-v1')
BIN = Path('/data/target/release/solana-test-validator')
ELF_SHA = 'd9f3822ec9097f0a7ede222f20a68c3cba92b6fba46459af8ed0025652f2f9f7'
TOKEN_SHA = 'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68'
FORBIDDEN = {'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'}

def rpc(port, method):
    body=json.dumps({'jsonrpc':'2.0','id':1,'method':method}).encode()
    with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+str(port),data=body,headers={'Content-Type':'application/json'}),timeout=4) as r:
        result=json.load(r)
    if 'error' in result: raise RuntimeError('Isolated RPC not ready')
    return result['result']

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists(), 'Do not replay a previous attempt or ledger'
    modules=ROOT/'node_modules/@solana'; modules.mkdir(parents=True)
    (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js', target_is_directory=True)
    (modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token', target_is_directory=True)
    state={'scope':'fresh private synthetic two-chain rehearsal','state':'starting','canonicalNetworkChanged':False,'productionReady':False}
    (ROOT/'attempt.json').write_text(json.dumps(state))
    version=subprocess.check_output([str(BIN),'--version'],text=True).strip()
    assert '3.0.14' in version
    for path,expected in [(ROOT/'bridge.so',ELF_SHA),(ROOT/'token2022.so',TOKEN_SHA)]:
        assert hashlib.sha256(path.read_bytes()).hexdigest()==expected, 'Program checksum mismatch'
    script="""const fs=require('fs');const{Keypair}=require('@solana/web3.js');const keys={};const names=['payer','originUser','nativeUser','program0','program1',...Array.from({length:5},(_,i)=>'committee'+i)];for(const name of names)keys[name]=Array.from(Keypair.generate().secretKey);const p=[0,1].map(i=>Keypair.fromSecretKey(Uint8Array.from(keys['program'+i])).publicKey.toBase58());const payer=Keypair.fromSecretKey(Uint8Array.from(keys.payer)).publicKey.toBase58();fs.writeFileSync('/data/bridge-rehearsal-v1/private-input.json',JSON.stringify({scope:'isolated-synthetic-two-chain',keys,programs:p,bridge:Keypair.generate().publicKey.toBase58(),payer,ports:[20899,21899],genesi:[]} ),{mode:384});"""
    subprocess.run(['node','-e',script],cwd='/app',check=True)
    data=json.loads((ROOT/'private-input.json').read_text());processes=[]
    for name in ['payer','program0','program1']:
        (ROOT/(name+'-private.json')).write_text(json.dumps(data['keys'][name]))
    try:
        for i,port in enumerate(data['ports']):
            ledger=ROOT/('ledger-'+str(i)); assert not ledger.exists()
            out=(ROOT/('validator-'+str(i)+'-private.log')).open('ab')
            cmd=[str(BIN),'--ledger',str(ledger),'--rpc-port',str(port),'--faucet-port',str(port+2),'--gossip-port',str(23000+i*100),'--bind-address','127.0.0.1','--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),'--limit-ledger-size','50000','--mint',data['payer'],'--quiet','--bpf-program','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',str(ROOT/'token2022.so')]
            process=subprocess.Popen(cmd,stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes.append(process)
            until=time.monotonic()+180
            while time.monotonic()<until:
                if process.poll() is not None:
                    state['startupExitCode']=process.returncode
                    (ROOT/'attempt.json').write_text(json.dumps(state))
                    raise RuntimeError('Private validator exited '+str(process.returncode)+'; inspect retained log')
                try:
                    genesis=rpc(port,'getGenesisHash')
                    assert genesis not in FORBIDDEN and genesis not in data['genesi'], 'Forbidden or duplicate genesis'
                    if rpc(port,'getHealth')=='ok': data['genesi'].append(genesis);break
                except (OSError, ValueError, RuntimeError): pass
                time.sleep(2)
            else: raise RuntimeError('Private readiness timed out')
            assert rpc(port,'getGenesisHash')==data['genesi'][i]
            with (ROOT/('deploy-'+str(i)+'-private.log')).open('ab') as deploy_log:
                subprocess.run(['/data/target/release/solana','--url','http://127.0.0.1:'+str(port),'--keypair',str(ROOT/'payer-private.json'),'--commitment','finalized','program','deploy',str(ROOT/'bridge.so'),'--program-id',str(ROOT/('program'+str(i)+'-private.json')),'--upgrade-authority',str(ROOT/'payer-private.json')],stdout=deploy_log,stderr=subprocess.STDOUT,check=True,timeout=180)
        (ROOT/'private-input.json').write_text(json.dumps(data))
        result=subprocess.run(['node',str(ROOT/'two-chain.mjs')],cwd='/app',stdout=(ROOT/'integration-private.log').open('ab'),stderr=subprocess.STDOUT,timeout=1200)
        if result.returncode: raise RuntimeError('Integration failed; bounded public result retained')
    finally:
        for process in processes:
            if process.poll() is None:
                os.killpg(process.pid,signal.SIGINT)
                try: process.wait(timeout=45)
                except subprocess.TimeoutExpired: os.killpg(process.pid,signal.SIGKILL);process.wait()
        state['state']='stopped';(ROOT/'attempt.json').write_text(json.dumps(state))

if __name__=='__main__': main()
