"""Copy one finalized full snapshot and exact vote interval from isolated target.

No original target/canonical ledger writes, keys, process control or release.
All copied snapshot/blocks stay private. Print only a bounded transfer receipt.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, json, os, re, shutil, urllib.request, uuid
spec=importlib.util.spec_from_file_location('recovery_core',Path(__file__).with_name('launcher.py'));core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)
SERVICE='43fc867b-1105-423c-a901-84ec5cb9a46a';VOLUME='b3030354-8a36-4fed-939e-ea957fd65001';BASELINE_SLOT=348492

def rpc(method,params=None):
    core.require(method in ['getGenesisHash','getSlot','getBlocks','getBlock'],'Read-only private snapshot RPC required')
    request=urllib.request.Request('http://127.0.0.1:25899',data=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params or []}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=15) as response:raw=response.read(4194305)
    core.require(len(raw)<=4194304,'Snapshot RPC bound exceeded');value=json.loads(raw)
    core.require(value.get('id')==1 and value.get('jsonrpc')=='2.0' and 'error' not in value,'Finalized snapshot read unavailable')
    return value['result']

def main():
    p=argparse.ArgumentParser();p.add_argument('attempt');p.add_argument('export');a=p.parse_args();os.umask(0o077)
    core.require(os.environ.get('RAILWAY_SERVICE_ID')==SERVICE and os.environ.get('RAILWAY_PROJECT_ID')==core.PROJECT and os.environ.get('RAILWAY_ENVIRONMENT_ID')==core.ENVIRONMENT and os.environ.get('RAILWAY_VOLUME_MOUNT_PATH')=='/data','Only actual isolated recovery service allowed')
    core.require(str(uuid.UUID(a.attempt))==a.attempt and str(uuid.UUID(a.export))==a.export,'Canonical attempt/export UUIDs required')
    root=Path('/data/classic-recovery')/a.attempt;core.directory(root);ledger=root/'restored/ledger';core.directory(ledger)
    core.require(rpc('getGenesisHash')==core.GENESIS,'Isolated genesis mismatch')
    with urllib.request.urlopen('http://127.0.0.1:3000/api/runtime',timeout=10) as response:runtime=json.load(response)
    core.require(runtime.get('genesis')==core.GENESIS and runtime.get('coreSha256')=='533950731d4ed6d94b59e71517613be002b6ec416b0ebb3a20a592fe5ec6f22f' and runtime.get('sourceCommit')=='119f25e225540be78b64b19bdb6cb300a1f47c10' and runtime.get('validatorBootId'),'Actual held source API identity required')
    finalized=rpc('getSlot',[{'commitment':'finalized'}]);candidates=[]
    for path in ledger.glob('snapshot-*.tar.zst'):
        match=re.fullmatch(r'snapshot-([0-9]+)-([1-9A-HJ-NP-Za-km-z]{32,44})\.tar\.zst',path.name)
        if match and BASELINE_SLOT<int(match[1])<=finalized and int(match[1])-BASELINE_SLOT<=10000:candidates.append((int(match[1]),path))
    core.require(candidates,'Wait for a new finalized complete snapshot; never substitute old snapshot or partial state')
    slot,snapshot=min(candidates);core.regular(snapshot,30000000)
    destination=root/('snapshot-export-'+a.export);destination.mkdir(mode=0o700)
    before=core.sha(snapshot);copy=destination/snapshot.name
    with snapshot.open('rb') as source,copy.open('xb') as out:shutil.copyfileobj(source,out)
    core.require(core.sha(copy)==before and core.sha(snapshot)==before,'Snapshot changed during private copy')
    genesis=ledger/'genesis.bin';core.regular(genesis,30000000);genesis_sha=core.sha(genesis)
    with genesis.open('rb') as source,(destination/'genesis.bin').open('xb') as out:shutil.copyfileobj(source,out)
    slots=rpc('getBlocks',[BASELINE_SLOT+1,slot,{'commitment':'finalized'}]);core.require(isinstance(slots,list) and 0<len(slots)<=10000 and slots==sorted(set(slots)) and all(type(s) is int and BASELINE_SLOT<s<=slot for s in slots),'Complete bounded finalized block range required')
    blocks={};total=0
    for block_slot in slots:
        block=rpc('getBlock',[block_slot,{'commitment':'finalized','encoding':'json','transactionDetails':'full','rewards':True,'maxSupportedTransactionVersion':0}]);core.require(isinstance(block,dict),'Finalized vote block pruned or missing')
        total+=len(json.dumps(block));core.require(total<=30000000,'Private vote evidence bound exceeded');blocks[str(block_slot)]=block
    with (destination/'vote-blocks-private.json').open('x') as out:out.write(json.dumps({'fromExclusiveSlot':BASELINE_SLOT,'throughSlot':slot,'slots':slots,'blocks':blocks},separators=(',',':'))+'\n')
    core.require(rpc('getGenesisHash')==core.GENESIS and rpc('getSlot',[{'commitment':'finalized'}])>=slot,'Snapshot identity/finality changed')
    report={'schemaVersion':1,'scope':'private finalized isolated-recovery full snapshot and exact block export only; not inspected bank or release acceptance','passed':True,'genesis':core.GENESIS,'targetServiceId':SERVICE,'targetVolumeId':VOLUME,'attempt':a.attempt,'export':a.export,'runtime':runtime,'snapshot':{'name':snapshot.name,'slot':slot,'bytes':copy.stat().st_size,'sha256':before,'finalizedSlotAtSelection':finalized},'genesisFileSHA256':genesis_sha,'voteInterval':{'fromExclusiveSlot':BASELINE_SLOT,'throughSlot':slot,'blocks':len(slots),'sha256':core.sha(destination/'vote-blocks-private.json')},'operatorKeysExported':False,'completeBankInspected':False,'canonicalNetworkChanged':False}
    with (destination/'export-report.json').open('x') as out:out.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'attempt':a.attempt,'export':a.export,'snapshot':report['snapshot'],'voteBlocks':len(slots),'operatorKeysExported':False,'completeBankInspected':False}))
if __name__=='__main__':main()
