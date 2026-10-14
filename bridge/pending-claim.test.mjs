import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { preparePendingClaim, takeSubmissionAttempt, reconcilePendingClaim } from './pending-claim.mjs';
import { fixture } from './test-fixtures/pending.mjs';
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
