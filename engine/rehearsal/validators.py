"""Exact synthetic genesis and three private Agave-validator processes.

All nodes use fresh local keys on one host: this tests implementation, not
independent operators or production decentralization. No public RPC is exposed.
"""
from pathlib import Path
import hashlib, json, os, shutil, signal, subprocess, time, urllib.request

ROOT=Path('/data/mainnet-rehearsal-v1')
BIN=Path('/data/target/release')
FORBIDDEN={'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'}
TOTAL=1_000_000_000_000

def rpc(port,method,params=None):
    req=urllib.request.Request('http://127.0.0.1:'+str(port),data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params or []}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=5) as r: body=json.load(r)
    if 'error' in body: raise RuntimeError('Private validator RPC rejected '+method)
    return body['result']

def run(command,name):
    with (ROOT/(name+'-private.log')).open('ab') as log:
        subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True,timeout=180)

def audit(ledger):
    return json.loads(subprocess.check_output([str(BIN/'classic-genesis-audit'),str(ledger)],text=True))

def main():
    os.umask(0o077)
    assert ROOT.is_dir() and not (ROOT/'validator-attempt.json').exists(), 'Explicit fresh attempt required'
    proof={'schemaVersion':1,'scope':'three disposable private source-built Agave 3.0.14 validators on one host; synthetic native balances','state':'running','startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'productionReady':False,'canonicalNetworkChanged':False,'independentOperatorsVerified':False,'checks':[]}
    (ROOT/'validator-attempt.json').write_text(json.dumps(proof))
    def save(): (ROOT/'public-validators.json').write_text(json.dumps(proof,indent=2))
    def passed(text): proof['checks'].append(text);save();print('PASS '+text,flush=True)
    save();nodes=[];processes=[]
    try:
        for binary in ['solana-genesis','agave-validator','solana-keygen']:
            path=BIN/binary;version=subprocess.check_output([str(path),'--version'],text=True).strip();assert '3.0.14' in version
            proof.setdefault('binaries',{})[binary]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'version':version}
        for i in range(3):
            node={'rpc':24899+i*100,'gossip':25000+i*100}
            for kind in ['identity','vote','stake']:
                path=ROOT/(str(i)+'-'+kind+'-private.json');run([str(BIN/'solana-keygen'),'new','--no-bip39-passphrase','--silent','--outfile',str(path)],'keys')
                node[kind]=subprocess.check_output([str(BIN/'solana-keygen'),'pubkey',str(path)],text=True).strip();node[kind+'File']=str(path)
            nodes.append(node)
        reserveFile=ROOT/'reserve-private.json';run([str(BIN/'solana-keygen'),'new','--no-bip39-passphrase','--silent','--outfile',str(reserveFile)],'keys');reserve=subprocess.check_output([str(BIN/'solana-keygen'),'pubkey',str(reserveFile)],text=True).strip()
        primordial=ROOT/'primordial.json'
        def genesis(ledger,reserveUnits):
            primordial.write_text(json.dumps({reserve:{'balance':reserveUnits,'owner':'11111111111111111111111111111111','data':'~','executable':False}}))
            cmd=[str(BIN/'solana-genesis'),'--ledger',str(ledger),'--cluster-type','development','--inflation','none','--hashes-per-tick','sleep','--slots-per-epoch','128','--bootstrap-validator-lamports','10000000000','--bootstrap-validator-stake-lamports','100000000000','--fee-burn-percentage','0','--rent-burn-percentage','0','--faucet-pubkey',reserve,'--faucet-lamports','0','--primordial-accounts-file',str(primordial)]
            for node in nodes: cmd+=['--bootstrap-validator',node['identity'],node['vote'],node['stake']]
            run(cmd,'genesis');return audit(ledger)
        probe=genesis(ROOT/'budget-probe',1);base=int(probe['totalLamports'])-1;assert 0<base<TOTAL
        original=ROOT/'genesis-ledger';g=genesis(original,TOTAL-base);assert int(g['totalLamports'])==TOTAL and g['genesis'] not in FORBIDDEN
        reserveAccount=next(a for a in g['accounts'] if a['address']==reserve);assert int(reserveAccount['lamports'])==TOTAL-base
        assert g['inflation']['initial']==0 and g['inflation']['terminal']==0
        assert g['feeRateGovernor']['burnPercent']==0 and g['rent']['burn_percent']==0
        proof['genesis']=g['genesis'];proof['genesisAudit']=g;proof['budget']={'totalNativeUnits':str(TOTAL),'reserveNativeUnits':str(TOTAL-base),'allOtherGenesisUnits':str(base),'backing':'synthetic rehearsal only; no real original SOC or bootstrap bridge counters'}
        passed('every actual genesis account reconciles to exact synthetic supply; inflation and selected rehearsal burns are zero')
        for i,node in enumerate(nodes):
            ledger=ROOT/('node-'+str(i));ledger.mkdir();
            for name in ['genesis.bin','genesis.tar.bz2']: shutil.copy2(original/name,ledger/name)
            cmd=[str(BIN/'agave-validator'),'--ledger',str(ledger),'--identity',node['identityFile'],'--vote-account',node['vote'],'--expected-genesis-hash',g['genesis'],'--bind-address','127.0.0.1','--gossip-port',str(node['gossip']),'--dynamic-port-range',str(26000+i*100)+'-'+str(26050+i*100),'--rpc-bind-address','127.0.0.1','--rpc-port',str(node['rpc']),'--private-rpc','--full-rpc-api','--rpc-threads','2','--rpc-blocking-threads','2','--no-port-check','--no-poh-speed-test','--no-os-network-limits-test','--allow-private-addr','--no-wait-for-vote-to-start-leader','--limit-ledger-size','50000000','--accounts-db-cache-limit-mb','128','--unified-scheduler-handler-threads','2','--log',str(ROOT/('node-'+str(i)+'-validator-private.log'))]
            if i:cmd+=['--entrypoint','127.0.0.1:'+str(nodes[0]['gossip'])]
            out=(ROOT/('node-'+str(i)+'-private.log')).open('ab');p=subprocess.Popen(cmd,stdout=out,stderr=subprocess.STDOUT,start_new_session=True);processes.append(p)
        until=time.monotonic()+240
        while time.monotonic()<until:
            if any(p.poll() is not None for p in processes): raise RuntimeError('A private validator exited: '+str([p.poll() for p in processes]))
            try:
                slots=[rpc(n['rpc'],'getSlot',[{'commitment':'finalized'}]) for n in nodes]
                identities=[rpc(n['rpc'],'getGenesisHash') for n in nodes]
                if min(slots)>=40 and identities==[g['genesis']]*3:break
            except (OSError,ValueError,RuntimeError):pass
            time.sleep(3)
        else:raise RuntimeError('Three-validator finality did not converge within bounded rehearsal')
        proof['nodes']=[{k:n[k] for k in ['identity','vote','stake','rpc','gossip']} for n in nodes];proof['initialFinalizedSlots']=slots
        votes=rpc(nodes[0]['rpc'],'getVoteAccounts');known={a['votePubkey'] for a in votes['current']};assert {n['vote'] for n in nodes}.issubset(known)
        passed('all three distinct validator vote accounts participate and RPCs report the same fresh genesis and finalized progress')
        proof['runtimeInflation']=[rpc(n['rpc'],'getInflationGovernor') for n in nodes]
        assert all(v['initial']==0 and v['terminal']==0 for v in proof['runtimeInflation']), 'Runtime inflation differs from planned zero inflation'
        proof['runtimeSupply']=[str(rpc(n['rpc'],'getSupply',[{'commitment':'finalized'}])['value']['total']) for n in nodes]
        assert proof['runtimeSupply']==[str(TOTAL)]*3, 'Runtime capitalization differs from exact genesis budget'
        passed('all three live banks report zero inflation and the exact genesis capitalization')
        time.sleep(20);later=[rpc(n['rpc'],'getSlot',[{'commitment':'finalized'}]) for n in nodes];assert all(b>a for a,b in zip(slots,later));proof['laterFinalizedSlots']=later
        passed('all three nodes advance finalized slots during bounded observation')
        proof['state']='passed';proof['completedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());save()
    except Exception as e:
        proof['state']='failed';proof['failure']=str(e)[:1200];save();raise
    finally:
        for p in processes:
            if p.poll() is None:
                os.killpg(p.pid,signal.SIGINT)
                try:p.wait(timeout=45)
                except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()

if __name__=='__main__': main()
