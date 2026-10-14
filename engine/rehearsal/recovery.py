"""Controlled SIGINT RPC/process recovery on retained private bridge ledgers only.

Preserve a cold archive before reopening them. No public network, bridge
transaction broadcast, host/service restart or frozen validator access.
"""
from pathlib import Path
import hashlib, json, os, signal, socket, subprocess, time, urllib.request

SOURCE=Path('/data/bridge-rehearsal-v1')
ROOT=Path('/data/bridge-recovery-v1')
BIN=Path('/data/target/release/solana-test-validator')
BIN_SHA='3d3140bf93c9bc967220ffd8989d8b0267b723915d32203132ecc36d2c63a49a'
FORBIDDEN={'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'}

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
    return h.hexdigest()

def validate(manifest,earlier,attempt):
    assert manifest.get('scope')=='isolated-synthetic-two-chain'
    assert attempt.get('state')=='stopped' and earlier.get('state')=='passed'
    assert manifest.get('genesi')==earlier.get('genesi')
    assert len(manifest['genesi'])==2 and len(set(manifest['genesi']))==2
    assert all(g not in FORBIDDEN for g in manifest['genesi'])
    assert manifest['ports']==[20899,21899]

def command(i,manifest):
    # No reset, genesis creation, program deployment or monetary operation.
    port=manifest['ports'][i]
    return [str(BIN),'--ledger',str(SOURCE/('ledger-'+str(i))),
            '--rpc-port',str(port),'--faucet-port',str(port+2),
            '--gossip-port',str(23000+i*100),'--bind-address','127.0.0.1',
            '--dynamic-port-range',str(23001+i*100)+'-'+str(23060+i*100),
            '--limit-ledger-size','50000','--quiet']

def rpc(port,method,params=None):
    body=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params or []}).encode()
    with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+str(port),data=body,headers={'Content-Type':'application/json'}),timeout=4) as r:
        d=json.load(r)
    if d.get('error'): raise RuntimeError('Private RPC rejected readiness')
    return d['result']

def stop(process):
    if process.poll() is None:
        os.killpg(process.pid,signal.SIGINT)
        try:process.wait(timeout=45)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid,signal.SIGKILL);process.wait()
            raise RuntimeError('Graceful private stop timed out; retained failed attempt')
    if process.returncode not in (0,-signal.SIGINT): raise RuntimeError('Private validator returned an unexpected stop status')
    return process.returncode

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'attempt.json').exists(),'Do not replay an attempt'
    manifest=json.loads((SOURCE/'private-input.json').read_text())
    earlier=json.loads((SOURCE/'public-result.json').read_text())
    validate(manifest,earlier,json.loads((SOURCE/'attempt.json').read_text()))
    assert sha(BIN)==BIN_SHA,'Source binary changed'
    for proc in Path('/proc').glob('[0-9]*'):
        try: first=(proc/'cmdline').read_bytes().split(b'\0')[0]
        except OSError:continue
        assert first!=str(BIN).encode(),'Another private validator is already active'
    for port in manifest['ports']:
        with socket.socket() as sock:sock.bind(('127.0.0.1',port))
    assert all((SOURCE/('ledger-'+str(i))/'genesis.bin').is_file() for i in range(2))
    state={'scope':'private retained-ledger controlled SIGINT recovery','state':'archiving','canonicalNetworkChanged':False,'productionReady':False,'starts':[],'stops':[]}
    def save(): (ROOT/'attempt.json').write_text(json.dumps(state,indent=2))
    save()
    archive=ROOT/'ledgers-before-private.tar'
    subprocess.run(['tar','-cf',str(archive),'ledger-0','ledger-1','private-input.json','public-result.json','attempt.json'],cwd=SOURCE,check=True,timeout=180)
    state['coldArchive']={'sha256':sha(archive),'bytes':archive.stat().st_size,'scope':'Stopped private ledgers retained before reopening; not a tested cold restore'};save()
    modules=ROOT/'node_modules/@solana';modules.mkdir(parents=True)
    (modules/'web3.js').symlink_to('/app/node_modules/@solana/web3.js',target_is_directory=True)
    (modules/'spl-token').symlink_to('/app/packages/chain/node_modules/@solana/spl-token',target_is_directory=True)
    processes={}; handles=[]
    def start(i,minimum=0):
        out=(ROOT/('validator-'+str(i)+'-private.log')).open('ab');handles.append(out)
        p=subprocess.Popen(command(i,manifest),stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes[i]=p
        until=time.monotonic()+180
        while time.monotonic()<until:
            if p.poll() is not None:raise RuntimeError('Private recovery validator exited; inspect retained log')
            try:
                assert rpc(manifest['ports'][i],'getGenesisHash')==manifest['genesi'][i],'Retained genesis changed'
                if rpc(manifest['ports'][i],'getHealth')=='ok' and rpc(manifest['ports'][i],'getSlot',[{'commitment':'finalized'}])>=minimum:break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(2)
        else:raise RuntimeError('Retained ledger readiness timed out')
        state['starts'].append({'side':i,'genesisMatches':True,'minimumFinalizedSlot':minimum});save()
    def halt(i):
        code=stop(processes.pop(i));state['stops'].append({'side':i,'signal':'SIGINT','returnCode':code,'applicationGracefulFlushVerified':False});save()
    def phase(name):
        with (ROOT/'recovery-private.log').open('ab') as log:
            subprocess.run(['node',str(ROOT/'recovery.mjs'),name],cwd='/app',stdout=log,stderr=subprocess.STDOUT,timeout=120,check=True)
        result=json.loads((ROOT/'public-result.json').read_text())
        assert result['state']!='failed','Recovery phase failed; inspect retained result'
    try:
        state['state']='running';save();start(0);start(1);phase('baseline')
        checkpoints=json.loads((ROOT/'checkpoint.json').read_text())
        halt(0);phase('origin-outage');start(0,checkpoints[0]['contextSlot']);phase('origin-recovered')
        halt(1);phase('native-outage');start(1,checkpoints[1]['contextSlot']);phase('complete')
        state['state']='passed'
    except Exception:
        state['state']='failed';raise
    finally:
        for i in list(processes):
            try:halt(i)
            except Exception:state['state']='failed';save();raise
        for handle in handles:handle.close()
        save()
    assert state['state']=='passed'
    report=json.loads((ROOT/'public-result.json').read_text())
    assert report['state']=='passed'
    report['coldArchive']=state['coldArchive'];report['processRecovery']={'starts':state['starts'],'stops':state['stops'],'allStopped':True}
    report['sourceBinarySHA256']=BIN_SHA
    report['remainingWork']=['Pending-operation settlement recovery','SIGKILL/power-loss and cold-restore drills','Pre-finalized fork/reorg policy and independent finality verification','Backed bootstrap and independent operators/security review']
    (ROOT/'public-result.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'state':'passed','checks':len(report['checks']),'canonicalNetworkChanged':False}))

if __name__=='__main__':main()
