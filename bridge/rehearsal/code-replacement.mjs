// Actual isolated native code replacement with mandatory programme pins. Disposable
// synthetic worker keys and signed journals remain private; no production RPC.
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram,SYSVAR_RENT_PUBKEY,SYSVAR_CLOCK_PUBKEY} from '@solana/web3.js';
import {getAssociatedTokenAddressSync,TOKEN_2022_PROGRAM_ID as TOKEN} from '@solana/spl-token';
import {observeLocalEvent,nativeClaimInstruction,PUBLIC_GENESIS} from './sdk.mjs';
import {preparePinnedPendingClaim,takePinnedSubmissionAttempt,inspectPendingClaim} from './pending-claim.mjs';
import {observePinnedProgram} from './program-pins.mjs';
import {verifyPrivateCodeReplacement} from './upgrade-observation.mjs';
const root='/data/bridge-code-replacement-v1',hash=b=>createHash('sha256').update(b).digest('hex');
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
const proof={schemaVersion:1,scope:'Actual incompatible native programme-code replacement on NEW private copied Agave ledgers; old-pin pending claim refusal, zero settlement broadcasts',state:'running',startedAt:new Date().toISOString(),checks:[],genesi:manifest.genesi,sourceBroadcasts:0,codeSetupBroadcasts:0,codeUpgradeBroadcasts:0,claimBroadcasts:0,negativeHandoffs:0,codeChanges:[],globalBacking:prior.globalBacking,productionReady:false,canonicalNetworkChanged:false,independentOperatorsVerified:false};
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
  save();proof.initial=await state();
  assert.equal(proof.initial.originOutstandingUnits,'1950000');
  assert.equal(proof.initial.nativeOutstandingUnits,'1950000');
  for(const s of sides)await observePinnedProgram({rpc:s.connection.rpcEndpoint,pins:s.pins,minimumContextSlot:s.minimum});
  mkdirSync(root+'/journal',{mode:0o700});
  pass('Both fresh copies match reviewed historical code, authority, policy and retained finalized checkpoints');
  const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
  const replacement=readFileSync(root+'/replacement.so'),replacementReview=JSON.parse(readFileSync(root+'/replacement-artifact-public.json'));
  assert.equal(replacement.length,3504);assert.equal(replacementReview.bytes,replacement.length);assert.equal(replacementReview.sha256,'cbf999bb25f5ac09468603499ac499b742e7891b091cadd0d47ffb34e572eca3');assert.equal(hash(replacement),replacementReview.sha256);assert.equal(replacement.subarray(0,4).toString('hex'),'7f454c46');
  const buffer=Keypair.generate();persistPrivate('buffer-key-private.json',Array.from(buffer.secretKey));
  const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
  async function sendLoader(name,ix,extra=[],upgrading=false){
    await admit(native);const block=await native.connection.getLatestBlockhash('finalized');
    const tx=new Transaction({feePayer:payer,...block}).add(...(Array.isArray(ix)?ix:[ix]));tx.sign(fixtureKey('payer'),...extra);
    persistPrivate('loader-'+name+'-private.json',{raw:tx.serialize().toString('base64'),lastValidBlockHeight:block.lastValidBlockHeight,state:'ATTEMPT_AUTHORIZED'});
    await admit(native);const sig=await native.connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});
    if(upgrading)proof.codeUpgradeBroadcasts++;else proof.codeSetupBroadcasts++;save();await finalized(native,sig,block);return sig;
  }
  const rent=await native.connection.getMinimumBalanceForRentExemption(37+replacement.length,'finalized');
  await sendLoader('create',[SystemProgram.createAccount({fromPubkey:payer,newAccountPubkey:buffer.publicKey,lamports:rent,space:37+replacement.length,programId:loader}),new TransactionInstruction({programId:loader,keys:[meta(buffer.publicKey,true),meta(payer)],data:u32(0)})],[buffer]);
  for(let offset=0;offset<replacement.length;offset+=800){const chunk=replacement.subarray(offset,offset+800);await sendLoader('write-'+offset,new TransactionInstruction({programId:loader,keys:[meta(buffer.publicKey,true),meta(payer,false,true)],data:Buffer.concat([u32(1),u32(offset),u64(BigInt(chunk.length)),chunk])}));}
  const staged=await native.connection.getAccountInfo(buffer.publicKey,'finalized');assert(staged.owner.equals(loader)&&!staged.executable&&staged.data.length===37+replacement.length&&staged.data.readUInt32LE()===1&&staged.data[4]===1&&staged.data.subarray(5,37).equals(payer.toBuffer())&&staged.data.subarray(37).equals(replacement));
  assert.deepEqual(await state(),proof.initial);
  pass('Six one-shot private buffer setup transactions finalize the exact reviewed counter ELF without changing bridge accounts, obligations or reserve');
  const nonce=11n,event=PublicKey.findProgramAddressSync([Buffer.from('event'),origin.config.toBuffer(),originUser.toBuffer(),u64(nonce)],origin.program)[0];
  await admit(origin);assert.equal(await origin.connection.getAccountInfo(event,'finalized'),null,'Unused fresh nonce required');
  const sourceIx=new TransactionInstruction({programId:origin.program,keys:[meta(originUser,true,true),meta(origin.config,true),meta(origin.vault,true),meta(event,true),meta(SystemProgram.programId),meta(tokens,true),meta(escrow,true),meta(mint),meta(TOKEN)],data:Buffer.concat([Buffer.from([1]),u64(10000n),u64(nonce),nativeUser.toBuffer()])});
  const recent=await origin.connection.getLatestBlockhash('finalized'),sourceTx=new Transaction({feePayer:payer,...recent}).add(sourceIx);
  sourceTx.sign(fixtureKey('payer'),fixtureKey('originUser'));
  persistPrivate('source-private.json',{raw:sourceTx.serialize().toString('base64'),nonce:String(nonce),lastValidBlockHeight:recent.lastValidBlockHeight,state:'ATTEMPT_AUTHORIZED'});
  await admit(origin);const sourceSignature=await origin.connection.sendRawTransaction(sourceTx.serialize(),{skipPreflight:false,maxRetries:0});proof.sourceBroadcasts++;save();await finalized(origin,sourceSignature,recent);
  const expected={bridge:manifest.bridge,sourceChain:origin.genesis,destinationChain:native.genesis,sourceProgram:origin.program.toBase58(),destinationProgram:native.program.toBase58(),recipient:nativeUser.toBase58(),epoch:1n,direction:0};
  const observed=await observeLocalEvent({rpc:origin.connection.rpcEndpoint,expectedGenesis:origin.genesis,eventAddress:event.toBase58(),expected});assert.equal(observed.event.originAmount,10000n);
  const latest=await native.connection.getLatestBlockhash('finalized'),claimIx=nativeClaimInstruction({event:observed.event,expected,payer,committee:members}),claim=new Transaction({feePayer:payer,...latest}).add(claimIx);
  claim.sign(fixtureKey('payer'),...[0,1,2].map(i=>fixtureKey('committee'+i)));
  const op=preparePinnedPendingClaim({directory:root+'/journal',sourceRpc:origin.connection.rpcEndpoint,rpc:native.connection.rpcEndpoint,event:observed.event,expected,payer,committee:members,transaction:claim.serialize(),lastValidBlockHeight:latest.lastValidBlockHeight,originDecimals:6,sourceContextSlot:observed.contextSlot,minimumDestinationSlot:await native.connection.getSlot('finalized'),originMint:mint,programmePins:{source:origin.pins,destination:native.pins}});
  const journalPath=root+'/journal/'+op.id+'.json',journalHash=hash(readFileSync(journalPath));
  const economics=await state();assert.equal(economics.originOutstandingUnits,'1960000');assert.equal(economics.originEscrowUnits,'1960000');assert.equal(economics.nativeOutstandingUnits,'1950000');assert.equal(economics.originUserUnits,'40000');assert.equal(economics.reserveNativeUnits,'52000000');
  for(const s of sides)await observePinnedProgram({rpc:s.connection.rpcEndpoint,pins:s.pins,minimumContextSlot:s.minimum});
  pass('One new source lock finalized; original signed native claim remains PREPARED with zero handoff attempts and exact pending liability');
  const s=native;
  await admit(s);
  const programData=PublicKey.findProgramAddressSync([s.program.toBuffer()],loader)[0];
  const before=await s.connection.getAccountInfoAndContext(programData,'finalized');
  assert.equal(hash(before.value.data),s.pins.programDataSHA256);
  // The replacement is a reviewed small counter ELF, intentionally not a bridge.
  // Its successful Loader-v3 installation must never bless a settlement claim.
  const upgrade=new TransactionInstruction({programId:loader,keys:[meta(programData,true),meta(s.program,true),meta(buffer.publicKey,true),meta(payer,true),meta(SYSVAR_RENT_PUBKEY),meta(SYSVAR_CLOCK_PUBKEY),meta(payer,false,true)],data:u32(3)});
  const signature=await sendLoader('upgrade',upgrade,[],true);
  const after=await s.connection.getAccountInfoAndContext(programData,{commitment:'finalized',minContextSlot:before.context.slot});
  const wire=v=>({context:v.context,value:{...v.value,owner:v.value.owner.toBase58(),data:[v.value.data.toString('base64'),'base64']}});
  const changed=verifyPrivateCodeReplacement({pins:s.pins,replacementSHA256:replacementReview.sha256,replacementBytes:replacement.length,before:wire(before),after:wire(after)});
  assert.equal(changed.authorityUnchanged,true);assert.notEqual(changed.newElfSHA256,changed.oldElfSHA256);
  const stillSource=await observePinnedProgram({rpc:origin.connection.rpcEndpoint,pins:origin.pins,minimumContextSlot:origin.minimum});assert.equal(stillSource.outstandingUnits,'1960000');
  await assert.rejects(observePinnedProgram({rpc:s.connection.rpcEndpoint,pins:s.pins,minimumContextSlot:after.context.slot}),/programme account differs/);
  pass('Actual Loader-v3 native code replacement finalizes with unchanged authority/capacity and different reviewed ELF; old code pins reject while source pins still match');
  const height=await native.connection.getBlockHeight('finalized');assert(height<=latest.lastValidBlockHeight,'Claim must still be unexpired for the code-pin negative control');
  await assert.rejects(takePinnedSubmissionAttempt(root+'/journal',op.id),/programme account differs/);
  proof.negativeHandoffs++;assert.equal(hash(readFileSync(journalPath)),journalHash);
  const retained=await inspectPendingClaim(root+'/journal',op.id);assert.equal(retained.state,'PREPARED');assert.equal(retained.attempts,0);assert.equal(retained.transactionHash,op.transactionHash);
  assert.equal(await native.connection.getAccountInfo(new PublicKey(op.id),'finalized'),null);assert.deepEqual(await state(),economics);
  proof.codeChanges.push({...changed,side:1,signature,claimStillUnexpiredAtBlockHeight:height,claimLastValidBlockHeight:latest.lastValidBlockHeight,journalUnchanged:true,attempts:0,receiptAbsent:true});
  pass('Unexpired original claim refuses handoff after actual native code replacement; journal unchanged, attempts0, receipt absent and exact bridge economics unchanged');
  proof.final=await state();assert.equal(proof.final.bootstrapRecordSHA256,proof.initial.bootstrapRecordSHA256);assert.equal(proof.final.protectedFloorNativeUnits,proof.initial.protectedFloorNativeUnits);
  assert.equal(BigInt(proof.final.originEscrowUnits)-BigInt(proof.final.nativeOutstandingUnits),10000n);
  proof.pendingLiabilityUnits='10000';proof.operation=await inspectPendingClaim(root+'/journal',op.id);proof.operationJournalSHA256=journalHash;
  assert.equal(proof.sourceBroadcasts,1);assert.equal(proof.codeSetupBroadcasts,6);assert.equal(proof.codeUpgradeBroadcasts,1);assert.equal(proof.claimBroadcasts,0);assert.equal(proof.negativeHandoffs,1);
  proof.state='passed';proof.completedAt=new Date().toISOString();save();
}catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
