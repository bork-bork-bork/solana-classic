// Fresh isolated V2 round trip with mandatory programme pins. Disposable
// synthetic worker keys and signed journals remain private; no production RPC.
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,TOKEN_2022_PROGRAM_ID as TOKEN} from '@solana/spl-token';
import {observeLocalEvent,nativeClaimInstruction,originClaimInstruction,PUBLIC_GENESIS} from './sdk.mjs';
import {preparePinnedPendingClaim,takePinnedSubmissionAttempt,takeSubmissionAttempt,reconcilePendingClaim,inspectPendingClaim} from './pending-claim.mjs';
import {observePinnedProgram} from './program-pins.mjs';
const root='/data/bridge-pinned-journal-v2',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(root+'/private-input.json')),baseline=JSON.parse(readFileSync(root+'/baseline-proof-public.json')),prior=JSON.parse(readFileSync(root+'/prior-settlement-public.json'));
const reviewed=JSON.parse(readFileSync(root+'/reviewed-pins-public.json'));
assert.equal(manifest.scope,'isolated-synthetic-bootstrap-v2');assert.equal(prior.state,'passed');assert(prior.processes.allStopped&&prior.settlementAccepted);assert.equal(prior.operation.state,'FINALIZED');
assert.equal(reviewed.state,'passed');assert(reviewed.processes.allStopped);assert.equal(reviewed.broadcasts,0);assert.deepEqual(manifest.genesi,prior.genesi);assert.equal(prior.globalBacking.actualGenesisBackingVerified,false);
assert.equal(manifest.genesi.length,2);assert.notEqual(manifest.genesi[0],manifest.genesi[1]);assert(manifest.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
const key=n=>new PublicKey(Uint8Array.from(manifest.keys[n].slice(32))),fixtureKey=n=>Keypair.fromSecretKey(Uint8Array.from(manifest.keys[n]));
const payer=key('payer'),originUser=key('originUser'),nativeUser=key('nativeUser'),members=[0,1,2].map(i=>key('committee'+i));
const bridge=new PublicKey(manifest.bridge),mint=new PublicKey(baseline.mint),boot=new PublicKey(baseline.reconciliation.bootstrapRecord);
const elf=readFileSync(root+'/bridge.so');assert.equal(hash(elf),'556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53');
const sides=[0,1].map(i=>{
  const program=new PublicKey(manifest.programs[i]),config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],program)[0],vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],program)[0];
  const bytes=Buffer.alloc(358);bytes.write('SCCFG001');for(const [o,v] of [[8,manifest.bridge],[40,manifest.genesi[i]],[72,manifest.genesi[1-i]],[104,manifest.programs[1-i]],[136,mint.toBase58()]])new PublicKey(v).toBuffer().copy(bytes,o);
  for(let j=0;j<5;j++)key('committee'+j).toBuffer().copy(bytes,168+j*32);bytes[328]=6;bytes[329]=9;bytes[330]=i;bytes[331]=3;bytes.writeBigUInt64LE(1n,332);bytes.writeBigUInt64LE(2000000n,342);bytes.writeBigUInt64LE(4000000n,350);
  const old=reviewed.observations[i];assert.equal(old.genesis,manifest.genesi[i]);assert.equal(old.program,program.toBase58());assert.equal(old.elfSHA256,hash(elf));assert.equal(old.elfBytes,elf.length);assert.equal(old.upgradeAuthority,payer.toBase58());assert.equal(old.policySHA256,hash(bytes));
  const pins={genesis:manifest.genesi[i],remoteGenesis:manifest.genesi[1-i],program:manifest.programs[i],remoteProgram:manifest.programs[1-i],bridge:manifest.bridge,originMint:mint.toBase58(),side:i,upgradeAuthority:payer.toBase58(),elfSHA256:hash(elf),elfBytes:elf.length,programDataSHA256:old.programDataSHA256,policySHA256:hash(bytes)};
  return {i,program,config,vault,pins,genesis:pins.genesis,connection:new Connection('http://127.0.0.1:'+manifest.ports[i],'finalized'),minimum:old.contextSlot};
});
const [origin,native]=sides,tokens=getAssociatedTokenAddressSync(mint,originUser,false,TOKEN),escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),origin.config.toBuffer()],origin.program)[0];
const proof={schemaVersion:1,scope:'Actual pinned-journal synthetic round trip on NEW private copied Agave ledgers; known-finalized settlement, no crash or real upgrade',state:'running',startedAt:new Date().toISOString(),checks:[],genesi:manifest.genesi,sourceBroadcasts:0,claimBroadcasts:0,negativeHandoffs:0,operations:[],pinAdmissions:[],globalBacking:prior.globalBacking,productionReady:false,canonicalNetworkChanged:false,independentOperatorsVerified:false,pinSource:{historicalPublicProofSHA256:hash(readFileSync(root+'/reviewed-pins-public.json')),policy:'Derived from reviewed synthetic fixture, not learnt from fresh endpoint',programmeData:'Previously reviewed cold-checkpoint full account hashes'}};
const save=()=>writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2)),pass=name=>{proof.checks.push(name);save();};
const meta=(pubkey,isWritable=false,isSigner=false)=>({pubkey,isWritable,isSigner}),u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;};
async function admit(s){assert.equal(await s.connection.getGenesisHash(),s.genesis);}
async function state(){
  for(const s of sides)await admit(s);
  const [a,b,v,record,e,user]=await Promise.all([origin.connection.getAccountInfo(origin.config,'finalized'),native.connection.getAccountInfo(native.config,'finalized'),native.connection.getAccountInfo(native.vault,'finalized'),native.connection.getAccountInfo(boot,'finalized'),origin.connection.getAccountInfo(escrow,'finalized'),origin.connection.getAccountInfo(tokens,'finalized')]);
  for(const [c,s] of [[a,origin],[b,native]])assert(c.owner.equals(s.program)&&c.data.length===382&&c.data.subarray(0,8).toString()==='SCCFG001');
  assert(v.owner.equals(native.program)&&v.data.length===16&&v.data.subarray(0,8).toString()==='SCVLT002');assert(record.owner.equals(native.program));assert(e.owner.equals(TOKEN)&&user.owner.equals(TOKEN));
  return {originOutstandingUnits:String(a.data.readBigUInt64LE(374)),nativeOutstandingUnits:String(b.data.readBigUInt64LE(374)),originEscrowUnits:String(e.data.readBigUInt64LE(64)),originUserUnits:String(user.data.readBigUInt64LE(64)),reserveNativeUnits:String(v.lamports),protectedFloorNativeUnits:String(v.data.readBigUInt64LE(8)),bootstrapRecordSHA256:hash(record.data)};
}
function persistPrivate(name,value){const fd=openSync(root+'/'+name,'wx',0o600);try{writeFileSync(fd,JSON.stringify(value));fsyncSync(fd);}finally{closeSync(fd);}const d=openSync(root,'r');try{fsyncSync(d);}finally{closeSync(d);}}
async function finalized(s,signature,recent){const r=await s.connection.confirmTransaction({...recent,signature},'finalized');assert.equal(r.value.err,null);await admit(s);}
try{
  save();proof.initial=await state();assert.deepEqual({...proof.initial,bootstrapRecordSHA256:undefined},{originOutstandingUnits:'1950000',nativeOutstandingUnits:'1950000',originEscrowUnits:'1950000',originUserUnits:'50000',reserveNativeUnits:'52000000',protectedFloorNativeUnits:'2000000',bootstrapRecordSHA256:undefined});
  for(const s of sides)assert.equal((await observePinnedProgram({rpc:s.connection.rpcEndpoint,pins:s.pins,minimumContextSlot:s.minimum})).outstandingUnits,'1950000');
  mkdirSync(root+'/journal',{mode:0o700});pass('New copies match baseline counters/escrow/user/reserve, bootstrap floor/record and independently selected historical code/policy pins');
  for(const direction of [0,1]){
    const source=sides[direction],destination=sides[1-direction],sender=direction===0?originUser:nativeUser,recipient=direction===0?nativeUser:originUser,nonce=direction===0?8n:9n;
    const event=PublicKey.findProgramAddressSync([Buffer.from('event'),source.config.toBuffer(),sender.toBuffer(),u64(nonce)],source.program)[0];
    await admit(source);assert.equal(await source.connection.getAccountInfo(event,'finalized'),null,'Unused fresh nonce required');
    const sourceBefore=await source.connection.getBalance(sender,'finalized'),recipientBefore=await destination.connection.getBalance(recipient,'finalized');
    const keys=[meta(sender,true,true),meta(source.config,true),meta(source.vault,true),meta(event,true),meta(SystemProgram.programId)];if(direction===0)keys.push(meta(tokens,true),meta(escrow,true),meta(mint),meta(TOKEN));
    const ix=new TransactionInstruction({programId:source.program,keys,data:Buffer.concat([Buffer.from([1]),u64(10000n),u64(nonce),recipient.toBuffer()])});
    const recent=await source.connection.getLatestBlockhash('finalized'),tx=new Transaction({feePayer:payer,...recent}).add(ix);tx.sign(fixtureKey('payer'),fixtureKey(direction===0?'originUser':'nativeUser'));
    persistPrivate('source-'+direction+'-private.json',{raw:tx.serialize().toString('base64'),nonce:String(nonce),lastValidBlockHeight:recent.lastValidBlockHeight,state:'ATTEMPT_AUTHORIZED'});
    await admit(source);const sourceSignature=await source.connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});proof.sourceBroadcasts++;save();await finalized(source,sourceSignature,recent);
    const expected={bridge:manifest.bridge,sourceChain:source.genesis,destinationChain:destination.genesis,sourceProgram:source.program.toBase58(),destinationProgram:destination.program.toBase58(),recipient:recipient.toBase58(),epoch:1n,direction};
    const observed=await observeLocalEvent({rpc:source.connection.rpcEndpoint,expectedGenesis:source.genesis,eventAddress:event.toBase58(),expected});assert.equal(observed.event.originAmount,10000n);
    const eventAccount=await source.connection.getAccountInfo(event,'finalized'),rent=await source.connection.getMinimumBalanceForRentExemption(297,'finalized');assert.equal(eventAccount.lamports,rent);assert.equal(sourceBefore-await source.connection.getBalance(sender,'finalized'),rent+(direction===1?10000000:0));
    const latest=await destination.connection.getLatestBlockhash('finalized'),claimIx=direction===0?nativeClaimInstruction({event:observed.event,expected,payer,committee:members}):originClaimInstruction({event:observed.event,expected,payer,committee:members,mint,destinationToken:tokens});
    const claim=new Transaction({feePayer:payer,...latest}).add(claimIx);claim.sign(fixtureKey('payer'),...[0,1,2].map(i=>fixtureKey('committee'+i)));
    const args={directory:root+'/journal',sourceRpc:source.connection.rpcEndpoint,rpc:destination.connection.rpcEndpoint,event:observed.event,expected,payer,committee:members,transaction:claim.serialize(),lastValidBlockHeight:latest.lastValidBlockHeight,originDecimals:6,sourceContextSlot:observed.contextSlot,minimumDestinationSlot:await destination.connection.getSlot('finalized'),originMint:mint,destinationToken:direction===1?tokens:null,programmePins:{source:source.pins,destination:destination.pins}};
    pass('Direction'+direction+' source nonce'+nonce+' finalizes once with exact10000-origin-unit event; sender rent verified separately');
    const before=await state();
    for(const [j,change] of [{elfSHA256:'0'.repeat(64)},{upgradeAuthority:key('committee0').toBase58()},{policySHA256:'0'.repeat(64)}].entries()){
      const dir=root+'/negative-'+direction+'-'+j;mkdirSync(dir,{mode:0o700});const op=preparePinnedPendingClaim({...args,directory:dir,programmePins:{source:{...source.pins,...change},destination:destination.pins}}),path=dir+'/'+op.id+'.json',bytes=hash(readFileSync(path));
      await assert.rejects(takePinnedSubmissionAttempt(dir,op.id),/code|policy|authority|programme/i);assert.equal(hash(readFileSync(path)),bytes);assert.equal((await inspectPendingClaim(dir,op.id)).attempts,0);proof.negativeHandoffs++;assert.equal(await destination.connection.getAccountInfo(new PublicKey(op.id),'finalized'),null);
    }
    assert.deepEqual(await state(),before);pass('Direction'+direction+' wrong expected code, authority and policy refuse handoff against actual accounts without journal or economic change');
    // Negative reads can consume blockhash lifetime. Never re-sign this claim.
    const op=preparePinnedPendingClaim(args),attempt=await takePinnedSubmissionAttempt(root+'/journal',op.id);const record=JSON.parse(readFileSync(root+'/journal/'+op.id+'.json'));assert.equal(record.schemaVersion,2);assert(record.programmePinHandoffAttempted);assert.equal(record.attempts,1);assert.equal(hash(attempt.rawTransaction),op.transactionHash);
    await admit(destination);const signature=await destination.connection.sendRawTransaction(attempt.rawTransaction,{skipPreflight:false,maxRetries:0});proof.claimBroadcasts++;assert.equal(signature,attempt.signature);proof.operations.push(op);proof.pinAdmissions.push({direction,policySHA256:record.programmePinPolicy.sha256,source:record.programmePinAdmission.source,destination:record.programmePinAdmission.destination});save();
    await finalized(destination,signature,latest);const settled=await reconcilePendingClaim(root+'/journal',op.id);assert.equal(settled.state,'FINALIZED');assert.equal(settled.signature,signature);
    await assert.rejects(takeSubmissionAttempt(root+'/journal',op.id),/attempt already exists/);await assert.rejects(takePinnedSubmissionAttempt(root+'/journal',op.id),/attempt already exists/);
    proof.operations[direction]=settled;assert.equal((await inspectPendingClaim(root+'/journal',op.id)).schemaVersion,2);
    const after=await state();assert.equal(after.bootstrapRecordSHA256,proof.initial.bootstrapRecordSHA256);assert.equal(after.protectedFloorNativeUnits,'2000000');
    if(direction===0){assert.equal(after.originOutstandingUnits,'1960000');assert.equal(after.nativeOutstandingUnits,'1960000');assert.equal(after.originEscrowUnits,'1960000');assert.equal(after.originUserUnits,'40000');assert.equal(after.reserveNativeUnits,'42000000');assert.equal(await destination.connection.getBalance(recipient,'finalized')-recipientBefore,10000000);}
    else{assert.deepEqual(after,proof.initial);assert.equal(await destination.connection.getBalance(recipient,'finalized'),recipientBefore);}
    proof.final=after;pass('Direction'+direction+' pinned journal hands off once and same signature/receipt/exact economics finalize; repeat handoff refuses');
  }
  assert.equal(proof.sourceBroadcasts,2);assert.equal(proof.claimBroadcasts,2);assert.equal(proof.negativeHandoffs,6);
  proof.state='passed';proof.completedAt=new Date().toISOString();save();
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
