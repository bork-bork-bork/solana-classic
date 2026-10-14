// Offline private-packet preflight only. Reports are operator assertions, not
// authenticated observations or independent-finality proof. No RPC or signer.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {inspectPendingClaim} from './pending-claim.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const u64=value=>{
  if(typeof value!=='string'||! /^(0|[1-9][0-9]*)$/.test(value)||BigInt(value)>(1n<<64n)-1n)throw new Error('Accounting requires canonical u64 decimal strings');
  return BigInt(value);
};
const height=value=>{
  if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid finalized checkpoint');return value;
};
const digest=value=>{
  if(typeof value!=='string'||! /^[0-9a-f]{64}$/.test(value))throw new Error('Invalid evidence hash');return value;
};
const key=value=>{
  if(typeof value!=='string'||new PublicKey(value).toBase58()!==value)throw new Error('Invalid observer identity');return value;
};

export async function reviewExpiredRedemption({directory,id,reports,accounting,reviewedAt=new Date().toISOString()}) {
  const operation=await inspectPendingClaim(directory,id);
  if(operation.scope!=='isolated-origin-redemption'||operation.state!=='EXPIRED_UNRESOLVED'||operation.attempts!==1)throw new Error('Only one-attempt expired original redemption can enter this review');
  const now=Date.parse(reviewedAt);
  if(!Number.isFinite(now)||new Date(now).toISOString()!==reviewedAt)throw new Error('Canonical review timestamp required');
  if(!Array.isArray(reports)||reports.length<2||reports.length>5)throw new Error('Two to five distinct observer reports required');
  const observers=new Set(),reportHashes=new Set();
  const observations=reports.map(report=>{
    const operator=key(report.operator),evidenceHash=digest(report.evidenceHash),at=Date.parse(report.observedAt);
    if(observers.has(operator)||reportHashes.has(evidenceHash))throw new Error('Duplicate observer or evidence');
    observers.add(operator);reportHashes.add(evidenceHash);
    if(!Number.isFinite(at)||new Date(at).toISOString()!==report.observedAt||at>now||now-at>300000)throw new Error('Observer report is stale or future-dated');
    for(const field of ['journalHash','eventHash','transactionHash','instructionHash','sourceChain','destinationChain','sourceProgram','destinationProgram','sourceEvent','signature'])if(report[field]!==operation[field])throw new Error('Observer report does not bind the original operation: '+field);
    if(height(report.sourceFinalizedSlot)<operation.sourceContextSlot||height(report.destinationFinalizedSlot)<operation.minimumDestinationSlot||height(report.destinationFinalizedHeight)<=operation.lastValidBlockHeight)throw new Error('Observer context precedes source, destination or expiry checkpoint');
    if(report.sourceReturnFinalized!==true||report.receipt!=='absent'||report.signatureStatus!=='absent'||report.historyCoverage!=='asserted-complete-for-attempt')throw new Error('Settlement or missing history requires reconciliation before expiry review');
    // Select fields explicitly: do not propagate signed transactions, credentials
    // or caller-supplied activation flags into any returned review packet.
    return {operator,evidenceHash,observedAt:report.observedAt,sourceFinalizedSlot:report.sourceFinalizedSlot,destinationFinalizedSlot:report.destinationFinalizedSlot,destinationFinalizedHeight:report.destinationFinalizedHeight,sourceReturnFinalized:true,receipt:'absent',signatureStatus:'absent',historyCoverage:'asserted-complete-for-attempt'};
  });
  const amounts=Object.fromEntries(['originEscrowUnits','originOutstandingUnits','nativeOutstandingUnits','pendingRedemptionUnits','reserveNativeUnits','protectedFloorNativeUnits'].map(k=>[k,u64(accounting?.[k])]));
  if(amounts.pendingRedemptionUnits!==u64(operation.originAmount)||amounts.originEscrowUnits!==amounts.originOutstandingUnits||amounts.originOutstandingUnits!==amounts.nativeOutstandingUnits+amounts.pendingRedemptionUnits||amounts.reserveNativeUnits<amounts.protectedFloorNativeUnits)throw new Error('Pending liability, escrow/counters or protected floor do not reconcile');
  const packet={schemaVersion:1,scope:'offline-isolated-expired-redemption-review',reviewedAt,operation,observations,accounting:Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,v.toString()])),structuralChecksPassed:true,observerAuthenticationVerified:false,operatorIndependenceVerified:false,sourceEconomicMovementVerified:false,historyCompletenessVerified:false,programCodeAndCustodyVerified:false,canRetry:false,canRefund:false,canResetAttempt:false,settlementAccepted:false,productionReady:false,requiredReview:['Authenticate observer reports and establish independent operators','Verify complete history and exact source/destination economic movements','Pin programme bytecode, upgrade authorities, configuration/epoch, mint and custody','Obtain a separately reviewed append-only decision; no recovery signer is implemented']};
  return {...packet,packetHash:hash(JSON.stringify(packet))};
}
