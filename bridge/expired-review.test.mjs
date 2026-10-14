import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Keypair} from '@solana/web3.js';
import {fixture} from './test-fixtures/pending.mjs';
import {preparePendingClaim,takeSubmissionAttempt,reconcilePendingClaim,inspectPendingClaim} from './pending-claim.mjs';
import {reviewExpiredRedemption} from './expired-review.mjs';
async function reviewFixture(t,direction=1) {
  const f=fixture(t,direction),r=preparePendingClaim(f.args);
  await takeSubmissionAttempt(f.directory,r.id,f.fetcher);f.mode('expired');await reconcilePendingClaim(f.directory,r.id,f.fetcher);
  const operation=await inspectPendingClaim(f.directory,r.id),path=join(f.directory,r.id+'.json'),before=readFileSync(path);
  const reviewedAt='2026-10-14T15:00:00.000Z';
  const reports=[0,1].map((v)=>({...operation,operator:Keypair.generate().publicKey.toBase58(),evidenceHash:String(v+1).repeat(64),observedAt:reviewedAt,sourceFinalizedSlot:30,destinationFinalizedSlot:50,destinationFinalizedHeight:101,sourceReturnFinalized:true,receipt:'absent',signatureStatus:'absent',historyCoverage:'asserted-complete-for-attempt'}));
  const accounting={originEscrowUnits:'1960000',originOutstandingUnits:'1960000',nativeOutstandingUnits:'960000',pendingRedemptionUnits:'1000000',reserveNativeUnits:'52000000',protectedFloorNativeUnits:'2000000'};
  return {...f,r,path,before,operation,options:{directory:f.directory,id:r.id,reports,accounting,reviewedAt}};
}
test('valid review binds signed attempt but cannot authorize settlement, refund or retry',async t=>{
  const f=await reviewFixture(t);f.options.reports[0].transactionBase64='private-input-do-not-propagate';f.options.reports[0].canRetry=true;
  const result=await reviewExpiredRedemption(f.options);
  assert.equal(result.structuralChecksPassed,true);assert.equal(result.canRetry,false);assert.equal(result.canRefund,false);assert.equal(result.canResetAttempt,false);assert.equal(result.settlementAccepted,false);assert.equal(result.productionReady,false);
  assert.equal(result.observerAuthenticationVerified,false);assert.equal(result.operatorIndependenceVerified,false);assert.equal(result.historyCompletenessVerified,false);
  assert.equal(result.operation.originAmount,'1000000');assert.equal(result.operation.signature,f.r.signature);assert.equal(result.operation.journalHash,f.operation.journalHash);
  assert(!JSON.stringify(result).includes('private-input-do-not-propagate'));assert(!Object.hasOwn(result.operation,'transactionBase64'));assert(!Object.hasOwn(result.operation,'rpc'));
  assert(readFileSync(f.path).equals(f.before));await assert.rejects(takeSubmissionAttempt(f.directory,f.r.id,f.fetcher));assert(f.calls.every(q=>q.method!=='sendTransaction'));
});
test('changed signed journal cannot be legitimized by matching report assertions',async t=>{
  const f=await reviewFixture(t),record=f.record(f.r.id);record.transactionHash='0'.repeat(64);writeFileSync(f.path,JSON.stringify(record));
  f.options.reports.forEach(r=>{r.transactionHash=record.transactionHash;});await assert.rejects(reviewExpiredRedemption(f.options),/Signed transaction bytes changed/);
});
test('late receipt, finalized status or missing history stops absent-settlement review',async t=>{
  const f=await reviewFixture(t);
  for(const change of [{receipt:'present'},{signatureStatus:'finalized'},{historyCoverage:'pruned'},{sourceReturnFinalized:false}]) {
    const reports=f.options.reports.map((r,i)=>i===0?{...r,...change}:r);await assert.rejects(reviewExpiredRedemption({...f.options,reports}));
  }
  assert(readFileSync(f.path).equals(f.before));
});
test('changed domain, original signature or exact economic instruction rejects',async t=>{
  const f=await reviewFixture(t);
  for(const field of ['journalHash','eventHash','transactionHash','instructionHash','sourceChain','destinationChain','sourceProgram','destinationProgram','sourceEvent','signature']) {
    const reports=f.options.reports.map((r,i)=>i===0?{...r,[field]:'changed'}:r);await assert.rejects(reviewExpiredRedemption({...f.options,reports}));
  }
});
test('duplicate, stale, future or insufficient observer checkpoints reject',async t=>{
  const f=await reviewFixture(t);
  for(const change of [{operator:f.options.reports[0].operator},{evidenceHash:f.options.reports[0].evidenceHash},{observedAt:'2026-10-14T14:54:59.000Z'},{observedAt:'2026-10-14T15:00:01.000Z'},{destinationFinalizedHeight:100},{destinationFinalizedSlot:49},{sourceFinalizedSlot:19}]) {
    const reports=[f.options.reports[0],{...f.options.reports[1],...change}];await assert.rejects(reviewExpiredRedemption({...f.options,reports}));
  }
  await assert.rejects(reviewExpiredRedemption({...f.options,reports:f.options.reports.slice(0,1)}));
});
test('pending liability remains backed; rounding, counter resets and reserve depletion reject',async t=>{
  const f=await reviewFixture(t);
  for(const change of [{pendingRedemptionUnits:'0'},{nativeOutstandingUnits:'1960000'},{originEscrowUnits:'1959999'},{reserveNativeUnits:'1999999'},{originOutstandingUnits:'1960000.0'},{originOutstandingUnits:1960000},{originOutstandingUnits:'18446744073709551616'}])await assert.rejects(reviewExpiredRedemption({...f.options,accounting:{...f.options.accounting,...change}}));
  assert(readFileSync(f.path).equals(f.before));
});
test('native claim and later known-finalized original redemption cannot use expiry packet',async t=>{
  const native=await reviewFixture(t,0);await assert.rejects(reviewExpiredRedemption(native.options));
  const origin=await reviewFixture(t);origin.mode('finalized');await reconcilePendingClaim(origin.directory,origin.r.id,origin.fetcher);
  await assert.rejects(reviewExpiredRedemption(origin.options));assert.equal(origin.record(origin.r.id).state,'FINALIZED');
});
