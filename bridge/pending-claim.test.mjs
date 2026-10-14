import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, chmodSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { encodeEvent, nativeClaimInstruction } from './sdk.mjs';
import { preparePendingClaim, takeSubmissionAttempt, reconcilePendingClaim } from './pending-claim.mjs';
function fixture(t) {
  const directory=realpathSync(mkdtempSync(join(tmpdir(),'sc-bridge-journal-')));chmodSync(directory,0o700);t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const k=()=>Keypair.generate(), payer=k(), committee=[k(),k(),k()], sender=k(), recipient=k();
  const e={bridge:k().publicKey.toBase58(),sourceChain:k().publicKey.toBase58(),destinationChain:k().publicKey.toBase58(),sourceProgram:k().publicKey.toBase58(),destinationProgram:k().publicKey.toBase58(),sender:sender.publicKey.toBase58(),recipient:recipient.publicKey.toBase58(),originAmount:1_000_000n,nonce:1n,slot:10n,epoch:1n,direction:0};
  const cfg=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(e.bridge).toBuffer()],new PublicKey(e.sourceProgram))[0];const nonce=Buffer.alloc(8);nonce.writeBigUInt64LE(e.nonce);e.sourceEvent=PublicKey.findProgramAddressSync([Buffer.from('event'),cfg.toBuffer(),sender.publicKey.toBuffer(),nonce],new PublicKey(e.sourceProgram))[0].toBase58();
  const ix=nativeClaimInstruction({event:e,expected:e,payer:payer.publicKey,committee:committee.map(k=>k.publicKey)});
  const tx=new Transaction({feePayer:payer.publicKey,recentBlockhash:k().publicKey.toBase58()}).add(ix);tx.sign(payer,...committee);
  const args={directory,sourceRpc:'http://127.0.0.1:8899',rpc:'http://127.0.0.1:9900',event:e,expected:e,payer:payer.publicKey,committee:committee.map(k=>k.publicKey),transaction:tx.serialize(),lastValidBlockHeight:100,originDecimals:6,sourceContextSlot:20,minimumDestinationSlot:0};
  const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,v] of [[8,e.bridge],[40,e.destinationChain],[72,e.sourceChain],[104,e.sourceProgram]])new PublicKey(v).toBuffer().copy(config,o);committee.forEach((k,i)=>k.publicKey.toBuffer().copy(config,168+i*32));config[328]=6;config[329]=9;config[330]=1;config[331]=3;config.writeBigUInt64LE(1n,332);
  let mode='pending';const calls=[];
  const fetcher=async(url,options)=>{
    const q=JSON.parse(options.body);calls.push(q);
    if(mode==='outage')throw new Error('unavailable');
    const source=new URL(url).port==='8899';let result;
    if(q.method==='getGenesisHash')result=mode==='wrongGenesis'?'wrong':source?e.sourceChain:e.destinationChain;
    else if(q.method==='getBlockHeight')result=mode==='expired'?101:50;
    else if(q.method==='getAccountInfo') {
      const value=source?{owner:e.sourceProgram,executable:false,data:[encodeEvent(mode==='changedSource'?{...e,originAmount:e.originAmount+1n}:e).toString('base64'),'base64']}:q.params[0]===ix.keys[1].pubkey.toBase58()?{owner:e.destinationProgram,executable:false,data:[config.toString('base64'),'base64']}:['finalized','pruned','conflict','badBalance'].includes(mode)?{owner:e.destinationProgram,executable:false,data:[new PublicKey(mode==='conflict'?e.sender:e.sourceEvent).toBuffer().toString('base64'),'base64']}:null;
      result={context:{slot:mode==='stale'?0:source?30:50},value};
    } else if(q.method==='getSignatureStatuses')result={context:{slot:50},value:['finalized','pruned','badBalance'].includes(mode)?[{slot:45,err:null,confirmationStatus:'finalized'}]:[null]};
    else if(q.method==='getTransaction') {
      if(mode==='pruned')result=null;
      else {const keys=tx.compileMessage().accountKeys,pre=keys.map(()=>100_000_000),post=[...pre];const recipientIndex=keys.findIndex(k=>k.toBase58()===e.recipient),vaultIndex=keys.findIndex(k=>k.equals(ix.keys[2].pubkey));pre[vaultIndex]=2_000_000_000;post[vaultIndex]=1_000_000_000;post[recipientIndex]+=mode==='badBalance'?999:1_000_000_000;result={slot:45,meta:{err:null,preBalances:pre,postBalances:post},transaction:[args.transaction.toString('base64'),'base64']};}
    } else throw new Error('Unexpected mutation or method');
    return {ok:true,text:async()=>JSON.stringify({jsonrpc:'2.0',id:1,result})};
  };
  return {directory,args,e,tx,ix,payer,committee,fetcher,calls,mode:v=>{mode=v;},record:id=>JSON.parse(readFileSync(join(directory,id+'.json')))};
}
test('signed bytes persist privately before the single submission attempt',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);assert.equal(r.state,'PREPARED');assert.equal(statSync(join(f.directory,r.id+'.json')).mode&0o777,0o600);
  const attempt=await takeSubmissionAttempt(f.directory,r.id,f.fetcher);
  assert(attempt.rawTransaction.equals(f.args.transaction));assert.equal(f.record(r.id).state,'SUBMISSION_ATTEMPTED');assert.equal(f.record(r.id).attempts,1);
  await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));assert(f.calls.every(q=>q.method!=='sendTransaction'));
});
test('one receipt domain cannot acquire replacement signed bytes or nonce',t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);assert.throws(()=>preparePendingClaim(f.args));
  const changed={...f.e,originAmount:2_000_000n};assert.throws(()=>preparePendingClaim({...f.args,event:changed,expected:changed}));assert.equal(f.record(r.id).transactionHash,r.transactionHash);
});
test('public endpoints, soaking chains and extra transfers reject before persistence',t=>{
  const f=fixture(t);assert.throws(()=>preparePendingClaim({...f.args,rpc:'https://api.mainnet-beta.solana.com'}));
  assert.throws(()=>preparePendingClaim({...f.args,event:{...f.e,destinationChain:'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'}}));
  f.tx.add(SystemProgram.transfer({fromPubkey:f.payer.publicKey,toPubkey:new PublicKey(f.e.recipient),lamports:1}));f.tx.sign(f.payer,...f.committee);assert.throws(()=>preparePendingClaim({...f.args,transaction:f.tx.serialize()}));
});
test('tampered signature and source checkpoint cannot produce a private record',t=>{
  const f=fixture(t),b=Buffer.from(f.args.transaction);b[1]^=1;assert.throws(()=>preparePendingClaim({...f.args,transaction:b}));assert.throws(()=>preparePendingClaim({...f.args,sourceContextSlot:9}));
});
test('wrong identity or consumed receipt stops the first attempt',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);f.mode('wrongGenesis');await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).attempts,0);
  f.mode('finalized');await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).attempts,0);
});
test('outage after an attempt retains same signature and cannot authorize a retry',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('outage');await assert.rejects(reconcilePendingClaim(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).signature,r.signature);assert.equal(f.record(r.id).attempts,1);
  f.mode('pending');const pending=await reconcilePendingClaim(f.directory,r.id,f.fetcher);assert.equal(pending.state,'PENDING');await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));
});
test('finalized receipt, exact transaction and economic deltas reconcile once',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('finalized');const result=await reconcilePendingClaim(f.directory,r.id,f.fetcher);assert.equal(result.state,'FINALIZED');assert.equal(result.signature,r.signature);assert.equal(result.attempts,1);assert.equal(f.record(r.id).finalizedSlot,45);
});
test('expiry or pruned transaction remains unresolved; never resets the attempt',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('expired');assert.equal((await reconcilePendingClaim(f.directory,r.id,f.fetcher)).state,'EXPIRED_UNRESOLVED');f.mode('pruned');assert.equal((await reconcilePendingClaim(f.directory,r.id,f.fetcher)).state,'CONSUMED_REVIEW_REQUIRED');await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));
});
test('conflicting receipt or balance movement cannot pass finalization',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);for(const mode of ['conflict','badBalance']){f.mode(mode);await assert.rejects(reconcilePendingClaim(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).state,'SUBMISSION_ATTEMPTED');}
});
test('a known finalized operation cannot regress on stale or missing RPC data',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('finalized');await reconcilePendingClaim(f.directory,r.id,f.fetcher);for(const mode of ['stale','pending']){f.mode(mode);await assert.rejects(reconcilePendingClaim(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).state,'FINALIZED');}
});
test('directory permissions and record corruption stop journal access',async t=>{
  const f=fixture(t);chmodSync(f.directory,0o755);assert.throws(()=>preparePendingClaim(f.args));chmodSync(f.directory,0o700);const r=preparePendingClaim(f.args);const p=join(f.directory,r.id+'.json'),d=f.record(r.id);d.attempts=9;writeFileSync(p,JSON.stringify(d));await assert.rejects(reconcilePendingClaim(f.directory,r.id,f.fetcher));
});
test('changed source economic event cannot authorize the signed claim',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);f.mode('changedSource');await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).attempts,0);
});
test('wrong native precision and stale source context stop before the attempt marker',async t=>{
  for(const change of [{originDecimals:5},{sourceContextSlot:31}]) {
    const f=fixture(t),r=preparePendingClaim({...f.args,...change});await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).attempts,0);
  }
});
test('an already expired signed transaction cannot obtain a submission attempt',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);f.mode('expired');await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).attempts,0);
});
test('concurrent callers cannot both obtain the signed bytes',async t=>{
  const f=fixture(t),r=preparePendingClaim(f.args);
  const results=await Promise.allSettled([Promise.resolve().then(()=>takeSubmissionAttempt(f.directory,r.id,f.fetcher)),Promise.resolve().then(()=>takeSubmissionAttempt(f.directory,r.id,f.fetcher))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.record(r.id).attempts,1);
});
