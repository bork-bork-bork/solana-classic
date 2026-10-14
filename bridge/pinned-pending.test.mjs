import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Keypair,PublicKey} from '@solana/web3.js';
import {fixture} from './test-fixtures/pending.mjs';
import {preparePendingClaim,preparePinnedPendingClaim,takeSubmissionAttempt,takePinnedSubmissionAttempt,reconcilePendingClaim,inspectPendingClaim} from './pending-claim.mjs';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const hash=b=>createHash('sha256').update(b).digest('hex');
const account=(b,owner,executable=false)=>({owner,executable,data:[b.toString('base64'),'base64']});
async function pinnedFixture(t,direction=0){
  const f=fixture(t,direction),extra=[Keypair.generate().publicKey,Keypair.generate().publicKey];
  const old=await f.fetcher(f.args.rpc,{body:JSON.stringify({method:'getAccountInfo',params:[f.ix.keys[1].pubkey.toBase58()]})});
  const mint=new PublicKey(Buffer.from(JSON.parse(await old.text()).result.value.data[0],'base64').subarray(136,168)).toBase58();
  const sides={};
  for(const source of [true,false]){
    const program=source?f.e.sourceProgram:f.e.destinationProgram,remoteProgram=source?f.e.destinationProgram:f.e.sourceProgram;
    const pins={genesis:source?f.e.sourceChain:f.e.destinationChain,remoteGenesis:source?f.e.destinationChain:f.e.sourceChain,program,remoteProgram,bridge:f.e.bridge,originMint:mint,side:source?direction:1-direction,upgradeAuthority:Keypair.generate().publicKey.toBase58()};
    const pd=PublicKey.findProgramAddressSync([new PublicKey(program).toBuffer()],new PublicKey(LOADER))[0];
    const executable=Buffer.alloc(36);executable.writeUInt32LE(2);pd.toBuffer().copy(executable,4);
    const elf=Buffer.from('7f454c4601020304','hex'),data=Buffer.alloc(45+elf.length+16);data.writeUInt32LE(3);data.writeBigUInt64LE(10n,4);data[12]=1;new PublicKey(pins.upgradeAuthority).toBuffer().copy(data,13);elf.copy(data,45);
    pins.elfBytes=elf.length;pins.elfSHA256=hash(elf);pins.programDataSHA256=hash(data);
    const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,v] of [[8,pins.bridge],[40,pins.genesis],[72,pins.remoteGenesis],[104,pins.remoteProgram],[136,mint]])new PublicKey(v).toBuffer().copy(config,o);
    [...f.committee.map(k=>k.publicKey),...extra].forEach((k,i)=>k.toBuffer().copy(config,168+i*32));
    config[328]=6;config[329]=9;config[330]=pins.side;config[331]=3;config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2000000n,342);config.writeBigUInt64LE(4000000n,350);pins.policySHA256=hash(config.subarray(0,358));
    sides[source?'source':'destination']={pins,executable,data,config,reads:0};
  }
  const calls=[];let heightReads=0,receiptReads=0,mode='normal',checkpoint=50;
  const fetcher=async(url,options)=>{
    const q=JSON.parse(options.body);calls.push(q);const source=new URL(url).port==='8899',side=sides[source?'source':'destination'];
    if(mode==='outage')throw Error('Synthetic unavailable RPC');
    let result;
    if(q.method==='getMultipleAccounts'&&q.params[0][0]===side.pins.program){
      side.reads++;const data=Buffer.from(side.data),config=Buffer.from(side.config);
      if(side.reads>=3){if(mode==='lateCode')data[45]^=1;if(mode==='lateAuthority')data[13]^=1;if(mode==='latePolicy')config[342]^=1;}
      result={context:{slot:mode==='stale'?0:checkpoint},value:[account(side.executable,LOADER,true),account(data,LOADER),account(config,side.pins.program)]};
    }else if(q.method==='getAccountInfo'&&!source&&q.params[0]===f.ix.keys[1].pubkey.toBase58())result={context:{slot:checkpoint},value:account(side.config,side.pins.program)};
    else if(q.method==='getBlockHeight'){heightReads++;result=mode==='lateExpiry'&&heightReads===2?101:mode==='lateHeightRegression'&&heightReads===2?49:50;}
    else {
      const r=await f.fetcher(url,options);result=JSON.parse(await r.text()).result;
      if(q.method==='getGenesisHash'&&mode==='wrongGenesis')result=Keypair.generate().publicKey.toBase58();
      if(q.method==='getAccountInfo'&&!source&&q.params[0]===f.ix.keys[3].pubkey.toBase58()&&++receiptReads===2&&mode==='lateReceipt')result.value=account(new PublicKey(f.e.sourceEvent).toBuffer(),f.e.destinationProgram);
      if(result?.context)result.context.slot=Math.max(result.context.slot,checkpoint,q.params?.[1]?.minContextSlot??0);
    }
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
  };
  return {...f,args:{...f.args,programmePins:{source:sides.source.pins,destination:sides.destination.pins}},fetcher,calls,sides,set:v=>{mode=v;},checkpoint:v=>{checkpoint=v;},path:id=>join(f.directory,id+'.json')};
}
for(const direction of [0,1])test(`pinned direction${direction} hands out original bytes once and recovers past admission checkpoint`,async t=>{
  const f=await pinnedFixture(t,direction),p=preparePinnedPendingClaim(f.args);
  const before=await inspectPendingClaim(f.directory,p.id);assert.equal(before.schemaVersion,2);assert.equal(before.programmePinsHash.length,64);assert(!Object.hasOwn(before,'transactionBase64'));
  const attempt=await takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher);assert(attempt.rawTransaction.equals(f.args.transaction));
  const saved=f.record(p.id);assert.equal(saved.programmePinHandoffAttempted,true);assert.equal(saved.programmePinAdmission.source.contextSlot,50);assert.equal(saved.attempts,1);assert.equal(f.sides.source.reads,4);assert.equal(f.sides.destination.reads,4);
  await assert.rejects(takeSubmissionAttempt(f.directory,p.id,f.fetcher),/already exists/);
  f.checkpoint(60);f.mode('finalized');assert.equal((await reconcilePendingClaim(f.directory,p.id,f.fetcher)).state,'FINALIZED');
  assert.equal((await inspectPendingClaim(f.directory,p.id)).state,'FINALIZED');
  assert.equal((await reconcilePendingClaim(f.directory,p.id,f.fetcher)).state,'FINALIZED');
  assert(f.calls.every(q=>!['sendTransaction','getLatestBlockhash'].includes(q.method)));
});
for(const mode of ['lateCode','lateAuthority','latePolicy','lateExpiry','lateHeightRegression','lateReceipt','wrongGenesis','stale','outage'])test(`${mode} blocks handoff without changing prepared journal bytes`,async t=>{
  const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args),before=readFileSync(f.path(p.id));f.set(mode);
  await assert.rejects(takeSubmissionAttempt(f.directory,p.id,f.fetcher));assert(readFileSync(f.path(p.id)).equals(before));assert.equal(f.record(p.id).attempts,0);
});
test('paused settlement, mismatched committee, precision and epoch reject even with freshly supplied digests',async t=>{
  for(const mode of ['pause','committee','precision','epoch']){
    const f=await pinnedFixture(t),s=f.sides.source;
    if(mode==='pause')s.config[341]=1;
    if(mode==='committee')Keypair.generate().publicKey.toBuffer().copy(s.config,296);
    if(mode==='precision')s.config[328]=7;
    if(mode==='epoch')s.config.writeBigUInt64LE(2n,332);
    s.pins.policySHA256=hash(s.config.subarray(0,358));const p=preparePinnedPendingClaim(f.args);
    await assert.rejects(takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher));assert.equal(f.record(p.id).attempts,0);
  }
});
test('wrong pin domain, mint, extra fields and missing digests cannot prepare',async t=>{
  for(const mode of ['domain','mint','extra','missing']){
    const f=await pinnedFixture(t),pins=f.args.programmePins.source;
    if(mode==='domain')pins.side=1;if(mode==='mint')pins.originMint=Keypair.generate().publicKey.toBase58();if(mode==='extra')pins.canSign=true;if(mode==='missing')delete pins.elfSHA256;
    assert.throws(()=>preparePinnedPendingClaim(f.args));assert.equal(f.calls.length,0);
  }
});
test('caller pin mutation cannot replace committed code, and stored policy tampering rejects',async t=>{
  const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args);f.sides.source.data[45]^=1;
  f.args.programmePins.source.programDataSHA256=hash(f.sides.source.data);f.args.programmePins.source.elfSHA256=hash(f.sides.source.data.subarray(45,53));
  await assert.rejects(takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher));
  const record=f.record(p.id);record.programmePinPolicy.source.elfSHA256='a'.repeat(64);writeFileSync(f.path(p.id),JSON.stringify(record));
  await assert.rejects(inspectPendingClaim(f.directory,p.id),/digest changed/);
});
test('concurrent callers get at most one handoff under the journal lock',async t=>{
  const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args);
  const r=await Promise.allSettled([Promise.resolve().then(()=>takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher)),Promise.resolve().then(()=>takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher))]);
  assert.equal(r.filter(v=>v.status==='fulfilled').length,1);assert.equal(f.record(p.id).attempts,1);
});
test('pinned-only entry refuses legacy records while legacy rehearsal remains supported',async t=>{
  const f=await pinnedFixture(t),p=preparePendingClaim(f.args);
  await assert.rejects(takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher),/version2/);
  assert.equal((await takeSubmissionAttempt(f.directory,p.id,f.fetcher)).signature,p.signature);
});
test('prepared expiry observation remains inspectable without a handoff admission or retry',async t=>{
  const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args),expired=async(...args)=>{const r=await f.fetcher(...args),body=await r.json();if(JSON.parse(args[1].body).method==='getBlockHeight')body.result=101;return new Response(JSON.stringify(body));};
  assert.equal((await reconcilePendingClaim(f.directory,p.id,expired)).state,'EXPIRED_UNRESOLVED');assert.equal(f.record(p.id).programmePinHandoffAttempted,false);
  assert.equal((await inspectPendingClaim(f.directory,p.id)).state,'EXPIRED_UNRESOLVED');await assert.rejects(takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher),/already exists/);
});
test('a saved signed handoff cannot lose its mandatory pin admission',async t=>{
  for(const mode of ['missing','flag','digest','checkpoint']){
    const f=await pinnedFixture(t),p=preparePinnedPendingClaim(f.args);await takePinnedSubmissionAttempt(f.directory,p.id,f.fetcher);const record=f.record(p.id);
    if(mode==='missing')delete record.programmePinAdmission;if(mode==='flag'){record.programmePinHandoffAttempted=false;delete record.programmePinAdmission;}if(mode==='digest')record.programmePinAdmission.policySHA256='b'.repeat(64);if(mode==='checkpoint')record.programmePinAdmission.source.contextSlot=0;
    writeFileSync(f.path(p.id),JSON.stringify(record));await assert.rejects(inspectPendingClaim(f.directory,p.id));
  }
});
