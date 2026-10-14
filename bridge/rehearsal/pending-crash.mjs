// One synthetic lock/claim on fresh V2 copies. No retry or replacement after
// the fault harness SIGKILLs the private destination before observed finality.
import { readFileSync,writeFileSync,mkdirSync,openSync,fsyncSync,closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync,TOKEN_2022_PROGRAM_ID as TOKEN } from '@solana/spl-token';
import { observeLocalEvent,nativeClaimInstruction,PUBLIC_GENESIS } from './sdk.mjs';
import { preparePendingClaim,takeSubmissionAttempt,reconcilePendingClaim } from './pending-claim.mjs';
import { parseNativeTransactionRPC } from './lossless-native-rpc.mjs';

const root='/data/bridge-v2-pending-crash-v1';
const manifest=JSON.parse(readFileSync(root+'/private-input.json'));
const earlier=JSON.parse(readFileSync(root+'/baseline-proof-public.json'));
assert.equal(manifest.scope,'isolated-synthetic-bootstrap-v2');assert.equal(earlier.state,'passed');assert.deepEqual(manifest.genesi,earlier.genesi);
assert.equal(earlier.globalBacking.actualGenesisBackingVerified,false);
assert(manifest.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
const phase=process.argv[2];assert(['submit','outage','recover'].includes(phase));
const key=n=>new PublicKey(Uint8Array.from(manifest.keys[n].slice(32)));
const payer=key('payer'),user=key('originUser'),recipient=key('nativeUser'),members=[0,1,2].map(i=>key('committee'+i));
const bridge=new PublicKey(manifest.bridge),mint=new PublicKey(earlier.mint),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const sides=[0,1].map(i=>({i,genesis:manifest.genesi[i],program:new PublicKey(manifest.programs[i]),connection:new Connection('http://127.0.0.1:'+manifest.ports[i],'finalized')}));
for(const s of sides){s.config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],s.program)[0];s.vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),s.config.toBuffer()],s.program)[0];}
const [origin,native]=sides;
const tokens=getAssociatedTokenAddressSync(mint,user,false,TOKEN),escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),origin.config.toBuffer()],origin.program)[0];
const boot=new PublicKey(earlier.reconciliation.bootstrapRecord);
const hash=b=>createHash('sha256').update(b).digest('hex');
let proof=phase==='submit'?{schemaVersion:1,scope:'New synthetic V2 lock/claim on copied real Agave ledgers, destination SIGKILL before observed claim finality and no-resubmission recovery',state:'running',startedAt:new Date().toISOString(),canonicalNetworkChanged:false,productionReady:false,genesi:manifest.genesi,globalBacking:earlier.globalBacking,checks:[],sourceBroadcasts:0,claimBroadcasts:0}:JSON.parse(readFileSync(root+'/public-result.json'));
const save=()=>writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
const pass=name=>{proof.checks.push(name);save();};
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
    assert.deepEqual(await Promise.all(sides.map(config)),[1_950_000n,1_950_000n]);assert.deepEqual(await originAmounts(),[1_950_000n,50_000n]);
    const fixed=await fixedNative();assert.equal(fixed.reserve,52_000_000);proof.initialNative=fixed;proof.recipientNativeBefore=await native.connection.getBalance(recipient,'finalized');
    const elf=readFileSync(root+'/bridge.so');
    for(const s of sides) {
      await admit(s);const pd=PublicKey.findProgramAddressSync([s.program.toBuffer()],loader)[0];const [program,data]=await s.connection.getMultipleAccountsInfo([s.program,pd],'finalized');
      assert(program.executable&&program.owner.equals(loader)&&data.owner.equals(loader));assert.equal(data.data[12],1);assert(data.data.subarray(13,45).equals(payer.toBuffer()));assert(data.data.subarray(45,45+elf.length).equals(elf));
    }
    pass('Fresh copies match V2 programme bytes/authority, bootstrap record/floor and1950000-unit baseline');
    mkdirSync(root+'/journal',{mode:0o700});
    const event=PublicKey.findProgramAddressSync([Buffer.from('event'),origin.config.toBuffer(),user.toBuffer(),u64(4n)],origin.program)[0];
    assert.equal(await origin.connection.getAccountInfo(event,'finalized'),null,'New copied-ledger nonce4 required');
    const lock=new TransactionInstruction({programId:origin.program,keys:[meta(user,true,true),meta(origin.config,true),meta(origin.vault,true),meta(event,true),meta(SystemProgram.programId),meta(tokens,true),meta(escrow,true),meta(mint),meta(TOKEN)],data:Buffer.concat([Buffer.from([1]),u64(10_000n),u64(4n),recipient.toBuffer()])});
    await admit(origin);const recent=await origin.connection.getLatestBlockhash('finalized');const tx=new Transaction({feePayer:payer,...recent}).add(lock);
    const fixtureKey=n=>Keypair.fromSecretKey(Uint8Array.from(manifest.keys[n]));
    tx.sign(fixtureKey('payer'),fixtureKey('originUser'));persistPrivate(root+'/source-private.json',{raw:tx.serialize().toString('base64'),lastValidBlockHeight:recent.lastValidBlockHeight,nonce:'4',state:'ATTEMPT_AUTHORIZED'});
    await admit(origin);proof.sourceSignature=await origin.connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});proof.sourceBroadcasts=1;save();
    const done=await origin.connection.confirmTransaction({...recent,signature:proof.sourceSignature},'finalized');assert.equal(done.value.err,null);
    const expected={bridge:bridge.toBase58(),sourceChain:origin.genesis,destinationChain:native.genesis,sourceProgram:origin.program.toBase58(),destinationProgram:native.program.toBase58(),recipient:recipient.toBase58(),epoch:1n,direction:0};
    const observed=await observeLocalEvent({rpc:origin.connection.rpcEndpoint,expectedGenesis:origin.genesis,eventAddress:event.toBase58(),expected});assert.equal(observed.event.originAmount,10_000n);
    assert.equal(await config(origin),1_960_000n);assert.equal(await config(native),1_950_000n);assert.deepEqual(await originAmounts(),[1_960_000n,40_000n]);pass('One new synthetic10000-unit source lock finalized; exact escrow and source counter agree');
    await admit(native);const latest=await native.connection.getLatestBlockhash('finalized');
    const claim=new Transaction({feePayer:payer,...latest}).add(nativeClaimInstruction({event:observed.event,expected,payer,committee:members}));claim.sign(fixtureKey('payer'),...['committee0','committee1','committee2'].map(fixtureKey));
    proof.operation=preparePendingClaim({directory:root+'/journal',sourceRpc:origin.connection.rpcEndpoint,rpc:native.connection.rpcEndpoint,event:observed.event,expected,payer,committee:members,transaction:claim.serialize(),lastValidBlockHeight:latest.lastValidBlockHeight,originDecimals:6,sourceContextSlot:observed.contextSlot,minimumDestinationSlot:await native.connection.getSlot('finalized')});save();
    const attempt=await takeSubmissionAttempt(root+'/journal',proof.operation.id);proof.operationStateBeforeBroadcast='SUBMISSION_ATTEMPTED';save();
    proof.claimSignature=await native.connection.sendRawTransaction(attempt.rawTransaction,{skipPreflight:false,maxRetries:0});assert.equal(proof.claimSignature,attempt.signature);proof.claimBroadcasts=1;proof.clientConfirmationWithheld=true;save();
    // Return immediately. Fault harness must not wait for destination finality.
    pass('Exact fully signed claim fsynced before one broadcast; no destination finality wait');
  } else if(phase==='outage') {
    const path=root+'/journal/'+proof.operation.id+'.json',before=hash(readFileSync(path));
    await assert.rejects(reconcilePendingClaim(root+'/journal',proof.operation.id));const r=await refuseRetry();assert.equal(r.state,'SUBMISSION_ATTEMPTED');assert.equal(hash(readFileSync(path)),before);
    pass('Actual killed-destination RPC outage preserves journal bytes/signature and refuses another handoff');
  } else {
    const before=JSON.parse(readFileSync(root+'/journal/'+proof.operation.id+'.json'));let result;
    const until=Date.now()+180_000;let sawUnavailable=false;
    while(Date.now()<until) {
      try {result=await reconcilePendingClaim(root+'/journal',proof.operation.id);}
      catch(error) {if(! /RPC|Destination context precedes/.test(error.message))throw error;sawUnavailable=true;await new Promise(r=>setTimeout(r,1000));continue;}
      if(result.state==='FINALIZED'||result.state==='EXPIRED_UNRESOLVED')break;
      if(result.state==='FAILED_REVIEW_REQUIRED')throw new Error('Failed claim requires retained manual review');
      // Missing history with a receipt can be transient after restart. Keep
      // reading the same signature without retrying, never accept it by time.
      await new Promise(r=>setTimeout(r,1000));
    }
    assert(result&&['FINALIZED','EXPIRED_UNRESOLVED'].includes(result.state),'Bounded recovery remained unresolved; retain attempt');
    const retained=await refuseRetry();assert.equal(retained.transactionBase64,before.transactionBase64);assert.equal(retained.eventHash,before.eventHash);assert.equal(retained.attempts,1);
    assert.equal(await config(origin),1_960_000n);assert.deepEqual(await originAmounts(),[1_960_000n,40_000n]);
    const fixed=await fixedNative();assert.equal(fixed.recordHash,proof.initialNative.recordHash);assert.equal(fixed.floor,proof.initialNative.floor);
    const balance=await native.connection.getBalance(recipient,'finalized');
    if(result.state==='FINALIZED') {
      assert.equal(await config(native),1_960_000n);assert.equal(fixed.reserve,42_000_000);assert.equal(balance-proof.recipientNativeBefore,10_000_000);
      const response=await fetch(native.connection.rpcEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransaction',params:[result.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}]}),signal:AbortSignal.timeout(5000)});assert(response.ok);
      const landed=parseNativeTransactionRPC(await response.text()).result;assert(landed&&landed.meta.err===null);assert.equal(hash(Buffer.from(landed.transaction[0],'base64')),retained.transactionHash);
      const tx=Transaction.from(Buffer.from(retained.transactionBase64,'base64'));const index=tx.compileMessage().accountKeys.findIndex(v=>v.equals(payer));assert(landed.meta.preBalances[index]>BigInt(Number.MAX_SAFE_INTEGER));
      proof.largeNativeMetadata={payerPreNativeUnits:String(landed.meta.preBalances[index]),payerPostNativeUnits:String(landed.meta.postBalances[index]),finalizedSlot:landed.slot};
      proof.settlementAccepted=true;pass('Same original signature/receipt and exact large-native metadata reconcile finalized V2 settlement after pre-finality crash');
    } else {
      assert.equal(await config(native),1_950_000n);assert.equal(fixed.reserve,52_000_000);assert.equal(balance,proof.recipientNativeBefore);assert.equal(await native.connection.getAccountInfo(new PublicKey(result.id),'finalized'),null);
      proof.settlementAccepted=false;pass('After expiry, absent claim stays unresolved with original bytes; no payout, retry, source refund or counter fabrication');
    }
    proof.operation=result;proof.recovery={state:result.state,transientRPCUnavailable:sawUnavailable,originOutstandingUnits:'1960000',nativeOutstandingUnits:String(await config(native)),originEscrowUnits:'1960000',originUserUnits:'40000',reserveNativeUnits:String(fixed.reserve),protectedFloorNativeUnits:fixed.floor,bootstrapRecordUnchanged:true};
    pass('Bootstrap floor/record and source backing survive; attempt/signature unchanged and repeat handoff forbidden');
    proof.state='passed';proof.completedAt=new Date().toISOString();save();
  }
} catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
