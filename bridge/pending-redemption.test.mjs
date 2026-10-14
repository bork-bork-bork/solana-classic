import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { originClaimInstruction } from './sdk.mjs';
import { preparePendingClaim, takeSubmissionAttempt, reconcilePendingClaim } from './pending-claim.mjs';
import { fixture } from './test-fixtures/pending.mjs';
test('original redemption instruction binds direction, mint and recipient ATA',t=>{
  const f=fixture(t,1);assert.equal(f.ix.keys.length,13);assert.equal(f.ix.keys.filter(k=>k.isSigner).length,4);
  assert.throws(()=>originClaimInstruction({event:f.e,expected:f.e,payer:f.payer.publicKey,committee:f.committee.map(k=>k.publicKey),mint:f.args.originMint,destinationToken:Keypair.generate().publicKey}));
  assert.throws(()=>preparePendingClaim({...f.args,event:{...f.e,direction:0}}));
});
test('same-signature original redemption verifies exact escrow and recipient token deltas',async t=>{
  const f=fixture(t,1),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('finalized');const result=await reconcilePendingClaim(f.directory,r.id,f.fetcher);assert.equal(result.state,'FINALIZED');assert.equal(result.signature,r.signature);assert.equal(result.attempts,1);
});
test('original redemption outage and pruning never authorize a replacement',async t=>{
  const f=fixture(t,1),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('outage');await assert.rejects(reconcilePendingClaim(f.directory,r.id,f.fetcher));f.mode('pruned');assert.equal((await reconcilePendingClaim(f.directory,r.id,f.fetcher)).state,'CONSUMED_REVIEW_REQUIRED');await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));f.mode('finalized');assert.equal((await reconcilePendingClaim(f.directory,r.id,f.fetcher)).state,'FINALIZED');
});
test('mutable mint, frozen/delegated tokens and wrong recipient owner block redemption',async t=>{
  const f=fixture(t,1),r=preparePendingClaim(f.args);
  for(const mode of ['mutableMint','frozenAccount','delegateAccount','wrongOwner']){f.mode(mode);await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).attempts,0);}
});
test('wrong token mint, missing metadata or incorrect token debit/credit cannot finalize',async t=>{
  const f=fixture(t,1),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);
  for(const mode of ['wrongTokenMint','missingTokenMetadata','badBalance']){f.mode(mode);await assert.rejects(reconcilePendingClaim(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).state,'SUBMISSION_ATTEMPTED');}
});
test('origin precision is checked against the actual bridge configuration',async t=>{
  const f=fixture(t,1),r=preparePendingClaim({...f.args,originDecimals:5});await assert.rejects(takeSubmissionAttempt(f.directory,r.id,f.fetcher));assert.equal(f.record(r.id).attempts,0);
});
test('noninteger original amount metadata is rejected rather than rounded',async t=>{
  const f=fixture(t,1),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('fractionalTokenBalance');await assert.rejects(reconcilePendingClaim(f.directory,r.id,f.fetcher));
});
test('a token redemption cannot hide an unrelated native reserve debit',async t=>{
  const f=fixture(t,1),r=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('hiddenNativeTransfer');await assert.rejects(reconcilePendingClaim(f.directory,r.id,f.fetcher));
});
