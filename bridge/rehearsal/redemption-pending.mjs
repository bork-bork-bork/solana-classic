// Synthetic native return/original redemption on fresh V2 ledger copies.
// One journaled withdrawal; no retry or replacement after destination crash.
import { readFileSync,writeFileSync,mkdirSync,openSync,fsyncSync,closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync,TOKEN_2022_PROGRAM_ID as TOKEN } from '@solana/spl-token';
import { observeLocalEvent,originClaimInstruction,PUBLIC_GENESIS } from './sdk.mjs';
import { preparePendingClaim,takeSubmissionAttempt,reconcilePendingClaim } from './pending-claim.mjs';
import { parseNativeTransactionRPC } from './lossless-native-rpc.mjs';

const root='/data/bridge-v2-redemption-pending-v1';
const manifest=JSON.parse(readFileSync(root+'/private-input.json'));
const earlier=JSON.parse(readFileSync(root+'/baseline-proof-public.json'));
const baseline=JSON.parse(readFileSync(root+'/prior-settlement-public.json'));
assert.equal(manifest.scope,'isolated-synthetic-bootstrap-v2');assert.equal(earlier.state,'passed');assert.equal(baseline.state,'passed');
assert.deepEqual(manifest.genesi,earlier.genesi);assert.deepEqual(manifest.genesi,baseline.genesi);
assert.equal(baseline.operation.state,'FINALIZED');assert.equal(earlier.globalBacking.actualGenesisBackingVerified,false);
assert(manifest.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
const phase=process.argv[2];assert(['submit','outage','recover'].includes(phase));
const key=n=>new PublicKey(Uint8Array.from(manifest.keys[n].slice(32)));
const payer=key('payer'),sender=key('nativeUser'),recipient=key('originUser'),members=[0,1,2].map(i=>key('committee'+i));
const bridge=new PublicKey(manifest.bridge),mint=new PublicKey(earlier.mint),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const sides=[0,1].map(i=>({i,genesis:manifest.genesi[i],program:new PublicKey(manifest.programs[i]),connection:new Connection('http://127.0.0.1:'+manifest.ports[i],'finalized')}));
for(const s of sides){s.config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],s.program)[0];s.vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),s.config.toBuffer()],s.program)[0];}
const [origin,native]=sides;
const tokens=getAssociatedTokenAddressSync(mint,recipient,false,TOKEN),escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),origin.config.toBuffer()],origin.program)[0];
const boot=new PublicKey(earlier.reconciliation.bootstrapRecord),hash=b=>createHash('sha256').update(b).digest('hex');
let proof=phase==='submit'?{schemaVersion:1,kind:'origin-redemption',scope:'Synthetic V2 native return/original-token redemption on fresh Agave copies; destination SIGKILL before observed redemption finality, same-signature recovery',state:'running',startedAt:new Date().toISOString(),canonicalNetworkChanged:false,productionReady:false,genesi:manifest.genesi,globalBacking:earlier.globalBacking,checks:[],sourceBroadcasts:0,claimBroadcasts:0}:JSON.parse(readFileSync(root+'/public-result.json'));
const save=()=>writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2)),pass=name=>{proof.checks.push(name);save();};
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner});
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
async function admit(s){assert.equal(await s.connection.getGenesisHash(),s.genesis);}
async function config(s) {
  await admit(s);const a=await s.connection.getAccountInfo(s.config,'finalized');assert(a.owner.equals(s.program)&&a.data.length===382);
  assert.equal(a.data.subarray(0,8).toString(),'SCCFG001');assert.equal(a.data[341],0);return a.data.readBigUInt64LE(374);
}
async function fixedNative() {
  await admit(native);const [vault,record]=await native.connection.getMultipleAccountsInfo([native.vault,boot],'finalized');
  assert(vault.owner.equals(native.program)&&vault.data.length===16);assert.equal(vault.data.subarray(0,8).toString(),'SCVLT002');assert.equal(vault.data.readBigUInt64LE(8),2_000_000n);
  assert(record.owner.equals(native.program));return {reserve:vault.lamports,recordHash:hash(record.data),floor:'2000000'};
}
async function originAmounts() {
  await admit(origin);const [a,b]=await origin.connection.getMultipleAccountsInfo([escrow,tokens],'finalized');assert(a.owner.equals(TOKEN)&&b.owner.equals(TOKEN));return [a.data.readBigUInt64LE(64),b.data.readBigUInt64LE(64)];
}
function persistPrivate(path,value) {
  const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}
  const directory=openSync(root,'r');try{fsyncSync(directory);}finally{closeSync(directory);}
}
async function refuseRetry() {
  await assert.rejects(takeSubmissionAttempt(root+'/journal',proof.operation.id),/attempt already exists/);
  const r=JSON.parse(readFileSync(root+'/journal/'+proof.operation.id+'.json'));
  assert.equal(r.attempts,1);assert.equal(r.signature,proof.claimSignature);assert.equal(r.transactionHash,proof.operation.transactionHash);return r;
}
try {
  save();
  if(phase==='submit') {
    assert.deepEqual(await Promise.all(sides.map(config)),[1_960_000n,1_960_000n]);assert.deepEqual(await originAmounts(),[1_960_000n,40_000n]);
    const fixed=await fixedNative();assert.equal(fixed.reserve,42_000_000);proof.initialNative=fixed;
    proof.recipientNativeBefore=await origin.connection.getBalance(recipient,'finalized');const senderBefore=await native.connection.getBalance(sender,'finalized');
    const elf=readFileSync(root+'/bridge.so');
    for(const s of sides) {
      await admit(s);const pd=PublicKey.findProgramAddressSync([s.program.toBuffer()],loader)[0];const [program,data]=await s.connection.getMultipleAccountsInfo([s.program,pd],'finalized');
      assert(program.executable&&program.owner.equals(loader)&&data.owner.equals(loader));assert.equal(data.data[12],1);assert(data.data.subarray(13,45).equals(payer.toBuffer()));assert(data.data.subarray(45,45+elf.length).equals(elf));
    }
    pass('New copies match accepted V2 native settlement: programme bytes/authority, bootstrap floor/record and1960000 counters');
    mkdirSync(root+'/journal',{mode:0o700});
    const event=PublicKey.findProgramAddressSync([Buffer.from('event'),native.config.toBuffer(),sender.toBuffer(),u64(7n)],native.program)[0];
    assert.equal(await native.connection.getAccountInfo(event,'finalized'),null,'New native-return nonce7 required; prior nonces5/6 are preserved');
    const returned=new TransactionInstruction({programId:native.program,keys:[meta(sender,true,true),meta(native.config,true),meta(native.vault,true),meta(event,true),meta(SystemProgram.programId)],data:Buffer.concat([Buffer.from([1]),u64(10_000n),u64(7n),recipient.toBuffer()])});
    await admit(native);const recent=await native.connection.getLatestBlockhash('finalized');const tx=new Transaction({feePayer:payer,...recent}).add(returned);
    const fixtureKey=n=>Keypair.fromSecretKey(Uint8Array.from(manifest.keys[n]));
    tx.sign(fixtureKey('payer'),fixtureKey('nativeUser'));persistPrivate(root+'/source-private.json',{raw:tx.serialize().toString('base64'),lastValidBlockHeight:recent.lastValidBlockHeight,nonce:'7',state:'ATTEMPT_AUTHORIZED'});
    await admit(native);proof.sourceSignature=await native.connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});proof.sourceBroadcasts=1;save();
    const done=await native.connection.confirmTransaction({...recent,signature:proof.sourceSignature},'finalized');assert.equal(done.value.err,null);
    const expected={bridge:bridge.toBase58(),sourceChain:native.genesis,destinationChain:origin.genesis,sourceProgram:native.program.toBase58(),destinationProgram:origin.program.toBase58(),recipient:recipient.toBase58(),epoch:1n,direction:1};
    const observed=await observeLocalEvent({rpc:native.connection.rpcEndpoint,expectedGenesis:native.genesis,eventAddress:event.toBase58(),expected});assert.equal(observed.event.originAmount,10_000n);
    assert.equal(await config(native),1_950_000n);assert.equal(await config(origin),1_960_000n);assert.deepEqual(await originAmounts(),[1_960_000n,40_000n]);
    assert.equal((await fixedNative()).reserve,52_000_000);
    const eventAccount=await native.connection.getAccountInfo(event,'finalized');assert(eventAccount.owner.equals(native.program));assert.equal(eventAccount.data.length,297);
    const eventRent=await native.connection.getMinimumBalanceForRentExemption(297,'finalized');assert.equal(eventAccount.lamports,eventRent);
    const senderDebit=senderBefore-await native.connection.getBalance(sender,'finalized');assert.equal(senderDebit,10_000_000+eventRent);
    proof.sourceCosts={returnedNativeUnits:'10000000',eventRentNativeUnits:String(eventRent),senderTotalDebitNativeUnits:String(senderDebit),sourceEvent:event.toBase58(),nonce:'7',transactionFeePayerSeparateFromSender:true};
    pass('One native return finalized: exact10000000-unit reserve credit; sender debit includes separately verified event-record rent');
    await admit(origin);const latest=await origin.connection.getLatestBlockhash('finalized');
    const claim=new Transaction({feePayer:payer,...latest}).add(originClaimInstruction({event:observed.event,expected,payer,committee:members,mint,destinationToken:tokens}));claim.sign(fixtureKey('payer'),...['committee0','committee1','committee2'].map(fixtureKey));
    proof.operation=preparePendingClaim({directory:root+'/journal',sourceRpc:native.connection.rpcEndpoint,rpc:origin.connection.rpcEndpoint,event:observed.event,expected,payer,committee:members,transaction:claim.serialize(),lastValidBlockHeight:latest.lastValidBlockHeight,originDecimals:6,sourceContextSlot:observed.contextSlot,minimumDestinationSlot:await origin.connection.getSlot('finalized'),originMint:mint,destinationToken:tokens});save();
    const attempt=await takeSubmissionAttempt(root+'/journal',proof.operation.id);proof.operationStateBeforeBroadcast='SUBMISSION_ATTEMPTED';proof.claimExpiry={lastValidBlockHeight:latest.lastValidBlockHeight};save();
    await admit(origin);proof.claimSignature=await origin.connection.sendRawTransaction(attempt.rawTransaction,{skipPreflight:false,maxRetries:0});assert.equal(proof.claimSignature,attempt.signature);proof.claimBroadcasts=1;proof.clientConfirmationWithheld=true;save();
    pass('Exact fully signed original redemption fsynced before one broadcast; no destination finality wait');
  } else if(phase==='outage') {
    const path=root+'/journal/'+proof.operation.id+'.json',before=hash(readFileSync(path));
    await assert.rejects(reconcilePendingClaim(root+'/journal',proof.operation.id));const r=await refuseRetry();assert.equal(r.state,'SUBMISSION_ATTEMPTED');assert.equal(hash(readFileSync(path)),before);
    pass('Actual killed-origin RPC outage preserves original redemption bytes/signature and refuses a second handoff');
  } else {
    const before=JSON.parse(readFileSync(root+'/journal/'+proof.operation.id+'.json'));let result;
    const until=Date.now()+180_000;let sawUnavailable=false;
    while(Date.now()<until) {
      try{result=await reconcilePendingClaim(root+'/journal',proof.operation.id);}
      catch(error){if(! /RPC|Destination context precedes/.test(error.message))throw error;sawUnavailable=true;await new Promise(r=>setTimeout(r,1000));continue;}
      if(result.state==='FINALIZED'||result.state==='EXPIRED_UNRESOLVED')break;
      if(result.state==='FAILED_REVIEW_REQUIRED')throw new Error('Failed original redemption requires retained manual review');
      // Receipt/history visibility may lag startup. Read the same signature;
      // elapsed time never accepts settlement or authorizes a replacement.
      await new Promise(r=>setTimeout(r,1000));
    }
    assert(result&&['FINALIZED','EXPIRED_UNRESOLVED'].includes(result.state),'Bounded recovery remained unresolved; retain attempt');
    assert.equal(result.state,'FINALIZED','Positive pending-redemption recovery not obtained; preserve attempt without retry');
    const retained=await refuseRetry();assert.equal(retained.transactionBase64,before.transactionBase64);assert.equal(retained.eventHash,before.eventHash);assert.equal(retained.attempts,1);
    assert.equal(await config(native),1_950_000n);const fixed=await fixedNative();assert.equal(fixed.recordHash,proof.initialNative.recordHash);assert.equal(fixed.floor,proof.initialNative.floor);assert.equal(fixed.reserve,52_000_000);
    assert.equal(await origin.connection.getBalance(recipient,'finalized'),proof.recipientNativeBefore);
    if(result.state==='FINALIZED') {
      assert.equal(await config(origin),1_950_000n);assert.deepEqual(await originAmounts(),[1_950_000n,50_000n]);
      const response=await fetch(origin.connection.rpcEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[result.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]}),signal:AbortSignal.timeout(5000)});assert(response.ok);
      const landed=parseNativeTransactionRPC(await response.text()).result;assert(landed&&landed.meta.err===null);assert.equal(hash(Buffer.from(landed.transaction[0],'base64')),retained.transactionHash);
      const tx=Transaction.from(Buffer.from(retained.transactionBase64,'base64'));const keys=tx.compileMessage().accountKeys,index=keys.findIndex(v=>v.equals(payer));assert(landed.meta.preBalances[index]>BigInt(Number.MAX_SAFE_INTEGER));
      const tokenDelta=address=>{
        const i=keys.findIndex(v=>v.equals(address));const value=list=>{const matches=list.filter(v=>v.accountIndex===i);assert.equal(matches.length,1);const v=matches[0];assert.equal(v.mint,mint.toBase58());assert.equal(v.uiTokenAmount.decimals,6);return BigInt(v.uiTokenAmount.amount);};
        return value(landed.meta.postTokenBalances)-value(landed.meta.preTokenBalances);
      };
      assert.equal(tokenDelta(escrow),-10_000n);assert.equal(tokenDelta(tokens),10_000n);
      proof.largeNativeMetadata={payerPreNativeUnits:String(landed.meta.preBalances[index]),payerPostNativeUnits:String(landed.meta.postBalances[index]),finalizedSlot:landed.slot};
      proof.originalTokenMovement={escrowDebitUnits:'10000',recipientCreditUnits:'10000',recipientNativeDeltaUnits:'0'};
      proof.settlementAccepted=true;pass('Same original signature/receipt and exact10000-token escrow debit/recipient credit finalize after pre-finality origin crash');
    } else {
      assert.equal(await config(origin),1_960_000n);assert.deepEqual(await originAmounts(),[1_960_000n,40_000n]);assert.equal(await origin.connection.getAccountInfo(new PublicKey(result.id),'finalized'),null);
      proof.settlementAccepted=false;pass('After expiry, original redemption remains unresolved without token payout, repeat handoff or native-source refund');
    }
    const [locked,user]=await originAmounts();proof.operation=result;proof.recovery={state:result.state,transientRPCUnavailable:sawUnavailable,originOutstandingUnits:String(await config(origin)),nativeOutstandingUnits:'1950000',originEscrowUnits:String(locked),originUserUnits:String(user),reserveNativeUnits:'52000000',protectedFloorNativeUnits:fixed.floor,bootstrapRecordUnchanged:true};
    pass('Native return backing and bootstrap floor/record survive; no duplicate withdrawal, new signature or attempt reset');
    proof.claimExpiry.destinationFinalizedHeightAfterRecovery=await origin.connection.getBlockHeight('finalized');proof.claimExpiry.originalLastValidBlockHeightUnchanged=retained.lastValidBlockHeight===proof.claimExpiry.lastValidBlockHeight;assert(proof.claimExpiry.originalLastValidBlockHeightUnchanged);
    proof.state='passed';proof.completedAt=new Date().toISOString();save();
  }
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
