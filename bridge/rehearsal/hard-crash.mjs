// Read/simulate only against copies of the stopped private V2 fixture.
// No deposits, bootstrap resets, transaction broadcasts or public RPC.
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Connection,PublicKey,Keypair,Transaction,TransactionInstruction,SystemProgram } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID as TOKEN,getAssociatedTokenAddressSync } from '@solana/spl-token';
import { decodeEvent,encodeEvent,observeLocalEvent,nativeClaimInstruction,originClaimInstruction,PUBLIC_GENESIS } from './sdk.mjs';
import { decodeBootstrapRecord } from './bridge/bootstrap.mjs';
const root='/data/bridge-hard-crash-v2',source='/data/bridge-bootstrap-v2';
const manifest=JSON.parse(readFileSync(source+'/private-input.json')),earlier=JSON.parse(readFileSync(source+'/public-result.json'));
assert.equal(manifest.scope,'isolated-synthetic-bootstrap-v2');assert.equal(earlier.state,'passed');assert.deepEqual(manifest.genesi,earlier.genesi);
assert(manifest.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));assert.notEqual(...manifest.genesi);
const phase=process.argv[2];assert(['baseline','origin-outage','origin-recovered','native-outage','verify'].includes(phase));
const pub=n=>new PublicKey(Uint8Array.from(manifest.keys[n].slice(32))),payer=pub('payer'),user=pub('originUser'),nativeUser=pub('nativeUser'),members=[0,1,2].map(i=>pub('committee'+i));
const bridge=new PublicKey(manifest.bridge),mint=new PublicKey(earlier.mint),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const k=x=>new PublicKey(x),u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;},pda=(seeds,p)=>PublicKey.findProgramAddressSync(seeds,p)[0];
const sides=[0,1].map(i=>{const program=k(manifest.programs[i]),config=pda([Buffer.from('config'),bridge.toBuffer()],program);return {i,program,config,vault:pda([Buffer.from('vault'),config.toBuffer()],program),programData:pda([program.toBuffer()],loader),genesis:manifest.genesi[i],connection:new Connection('http://127.0.0.1:'+manifest.ports[i],'finalized')};});
const [origin,native]=sides;
const event=(s,sender,nonce)=>pda([Buffer.from('event'),s.config.toBuffer(),sender.toBuffer(),u64(nonce)],s.program);
const bootEvent=event(origin,user,1n),nextEvent=event(origin,user,2n),returnEvent=event(native,nativeUser,3n);
const receipt=(s,e)=>pda([Buffer.from('claim'),s.config.toBuffer(),e.toBuffer()],s.program);
const escrow=pda([Buffer.from('escrow'),origin.config.toBuffer()],origin.program),tokens=getAssociatedTokenAddressSync(mint,user,false,TOKEN),record=pda([Buffer.from('bootstrap'),native.config.toBuffer()],native.program);
origin.addresses=[origin.config,origin.vault,origin.program,origin.programData,bootEvent,nextEvent,receipt(origin,returnEvent),escrow,tokens,mint,user];
native.addresses=[native.config,native.vault,native.program,native.programData,returnEvent,record,receipt(native,bootEvent),receipt(native,nextEvent),nativeUser];
const reportPath=root+'/public-result.json',checkpoint=root+'/checkpoint-private.json';
let report=phase==='baseline'?{schemaVersion:1,scope:'Actual private V2 Agave SIGKILL process/RPC recovery of known-finalized bridge state on copied ledgers; no broadcasts, pending-operation or power-loss proof',startedAt:new Date().toISOString(),state:'running',productionReady:false,canonicalNetworkChanged:false,genesi:manifest.genesi,broadcasts:0,checks:[],globalBacking:earlier.globalBacking}:JSON.parse(readFileSync(reportPath));
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2)),pass=name=>{report.checks.push(name);save();console.log('PASS '+name);};
async function observe(s,address,recipient,direction,minimumContextSlot=0){return observeLocalEvent({rpc:s.connection.rpcEndpoint,expectedGenesis:s.genesis,eventAddress:address.toBase58(),minimumContextSlot,expected:{bridge:bridge.toBase58(),sourceChain:s.genesis,destinationChain:sides[1-s.i].genesis,sourceProgram:s.program.toBase58(),destinationProgram:sides[1-s.i].program.toBase58(),recipient:recipient.toBase58(),epoch:1n,direction}});}
async function snapshot(s,minimum=0){
  assert.equal(await s.connection.getGenesisHash(),s.genesis);
  const result=await s.connection.getMultipleAccountsInfoAndContext(s.addresses,{commitment:'finalized',minContextSlot:minimum});assert(result.context.slot>=minimum);
  const data=result.value;assert(data.every(Boolean));assert(data[0].owner.equals(s.program));assert.equal(data[0].data.length,382);assert.equal(data[0].data.readBigUInt64LE(374),1_950_000n);
  assert(data[1].owner.equals(s.program));assert.equal(data[1].data.subarray(0,8).toString(),'SCVLT002');assert.equal(data[1].data.length,16);
  assert(data[2].executable&&data[2].owner.equals(loader));assert(data[3].owner.equals(loader));assert(data[3].data.subarray(13,45).equals(payer.toBuffer()));const elf=readFileSync(root+'/bridge.so');assert(data[3].data.subarray(45,45+elf.length).equals(elf));
  if(s.i===0){assert(data[6].owner.equals(s.program));assert(data[6].data.equals(returnEvent.toBuffer()));assert(data[7].owner.equals(TOKEN));assert.equal(data[7].data.readBigUInt64LE(64),1_950_000n);assert.equal(data[8].data.readBigUInt64LE(64),50_000n);}
  else {assert.equal(data[1].data.readBigUInt64LE(8),2_000_000n);assert.equal(data[1].lamports,52_000_000);assert(data[5].owner.equals(s.program));const boot=decodeBootstrapRecord(data[5].data);assert.equal(boot.originAmount,102_000n);assert.equal(boot.protectedNative,2_000_000n);assert.equal(boot.sourceEvent,bootEvent.toBase58());assert.equal(boot.inventorySHA256,earlier.reconciliation.bootstrapInventorySHA256);for(const [i,e] of [[6,bootEvent],[7,nextEvent]]){assert(data[i].owner.equals(s.program));assert(data[i].data.equals(e.toBuffer()));}}
  const accounts=data.map((a,i)=>{assert(Number.isSafeInteger(a.lamports));return {address:s.addresses[i].toBase58(),owner:a.owner.toBase58(),executable:a.executable,lamports:String(a.lamports),bytes:a.data.length,dataSHA256:createHash('sha256').update(a.data).digest('hex')};});
  assert.equal(await s.connection.getGenesisHash(),s.genesis);return {contextSlot:result.context.slot,accounts};
}
async function simulate(s,instruction,expectedError){
  assert.equal(await s.connection.getGenesisHash(),s.genesis);
  const tx=new Transaction({feePayer:payer,...await s.connection.getLatestBlockhash('finalized')}).add(instruction);
  tx.sign(...['payer','committee0','committee1','committee2'].map(n=>Keypair.fromSecretKey(Uint8Array.from(manifest.keys[n]))));
  const sim=await s.connection.simulateTransaction(tx);assert.deepEqual(sim.value.err,{InstructionError:[0,expectedError]});assert(sim.value.logs.some(l=>l.includes(s.program.toBase58())&&l.includes('invoke')));
  report.replays??=[];report.replays.push({side:s.i,error:sim.value.err,scope:'Actual compiled bridge RPC simulation; never broadcast'});
}
try {
  save();
  if(phase==='origin-outage'||phase==='native-outage'){
    const saved=JSON.parse(readFileSync(checkpoint)),off=phase==='origin-outage'?0:1,other=1-off,s=sides[off];
    await assert.rejects(observe(s,off===0?nextEvent:returnEvent,off===0?nativeUser:user,off,saved[off].contextSlot));
    assert.deepEqual((await snapshot(sides[other],saved[other].contextSlot)).accounts,saved[other].accounts);
    pass((off===0?'Origin':'Native')+' SIGKILL RPC outage refuses finalized observation; other ledger remains unchanged');
  }else{
  const stored=phase!=='baseline'?JSON.parse(readFileSync(checkpoint)):null,current=[];
  for(const s of sides){const minimum=stored?.[s.i].contextSlot??0;await observe(s,s.i===0?nextEvent:returnEvent,s.i===0?nativeUser:user,s.i,minimum);if(s.i===0)await observe(s,bootEvent,native.vault,0,minimum);current.push(await snapshot(s,minimum));}
  if(phase==='baseline'){writeFileSync(checkpoint,JSON.stringify(current,null,2));report.accountCounts=current.map(v=>v.accounts.length);report.baselineSlots=current.map(v=>v.contextSlot);pass('Working copies match passed V2 fixture: 20 finalized accounts, bootstrap record/floor, both counters, token escrow and consumed receipts');}
  else {
    for(const s of sides)assert.deepEqual(current[s.i].accounts,stored[s.i].accounts);
    if(phase==='origin-recovered'){pass('Origin SIGKILL restart preserves finalized state and all 20 bridge accounts');}
    else{
    report.recoveredSlots=current.map(v=>v.contextSlot);pass('Both SIGKILL-restarted ledgers preserve all 20 finalized account bytes, owners, balances and programme authorities');
    pass('Recovered observer accepts exact original events at or above retained same-genesis finalized checkpoints');
    const lock=await observe(origin,nextEvent,nativeUser,0,stored[0].contextSlot),returned=await observe(native,returnEvent,user,1,stored[1].contextSlot),bootLock=await observe(origin,bootEvent,native.vault,0,stored[0].contextSlot);
    await simulate(native,nativeClaimInstruction({event:lock.event,expected:lock.event,payer,committee:members}),'AccountAlreadyInitialized');
    await simulate(origin,originClaimInstruction({event:returned.event,expected:returned.event,payer,committee:members,mint,destinationToken:tokens}),'AccountAlreadyInitialized');
    await simulate(native,nativeClaimInstruction({event:{...bootLock.event,recipient:nativeUser.toBase58()},expected:{...bootLock.event,recipient:nativeUser.toBase58()},payer,committee:members}),'AccountAlreadyInitialized');
    const writable=pubkey=>({pubkey,isWritable:true,isSigner:false}),readonly=pubkey=>({pubkey,isWritable:false,isSigner:false});
    const recordData=(await native.connection.getAccountInfo(record,'finalized')).data;
    const bootIx=new TransactionInstruction({programId:native.program,keys:[{pubkey:payer,isWritable:true,isSigner:true},writable(native.config),writable(native.vault),writable(receipt(native,bootEvent)),writable(record),readonly(SystemProgram.programId),readonly(native.program),readonly(native.programData),...members.map(pubkey=>({pubkey,isWritable:false,isSigner:true}))],data:Buffer.concat([Buffer.from([4]),encodeEvent(bootLock.event),recordData.subarray(8,72)])});
    await simulate(native,bootIx,'InvalidArgument');pass('Native/original settlement replay, altered bootstrap recipient and second bootstrap still reject after SIGKILL restarts');
    for(const s of sides)assert.deepEqual((await snapshot(s,stored[s.i].contextSlot)).accounts,stored[s.i].accounts);pass('Four rejected simulations leave bridge state unchanged; zero broadcasts');
    report.state='passed';report.completedAt=new Date().toISOString();save();
    }
  }
  }
}catch(e){report.state='failed';report.failure=String(e.message).slice(0,800);save();throw e;}
