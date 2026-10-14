// Separate private worker only. Reads actual retained Agave bridge state and
// simulates rejected replays; no transaction broadcasts or new bridge deposits.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID as TOKEN } from '@solana/spl-token';
import { observeLocalEvent, decodeEvent, encodeEvent, nativeClaimInstruction, PUBLIC_GENESIS } from './sdk.mjs';
const root='/data/bridge-recovery-v1', source='/data/bridge-rehearsal-v1';
const manifest=JSON.parse(readFileSync(source+'/private-input.json'));
const earlier=JSON.parse(readFileSync(source+'/public-result.json'));
assert.equal(manifest.scope,'isolated-synthetic-two-chain');assert.equal(earlier.state,'passed');
assert.deepEqual(manifest.genesi,earlier.genesi);
assert(manifest.genesi.every(g => !PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
assert.notEqual(manifest.genesi[0],manifest.genesi[1]);
const phase=process.argv[2];assert(['baseline','origin-outage','origin-recovered','native-outage','complete'].includes(phase));
const publicKey=name=>new PublicKey(Uint8Array.from(manifest.keys[name].slice(32)));
const payer=publicKey('payer'), originUser=publicKey('originUser'), nativeUser=publicKey('nativeUser');
const members=Array.from({length:3},(_,i)=>publicKey('committee'+i));
const bridge=new PublicKey(manifest.bridge), mint=new PublicKey(earlier.mint);
const side=i=>({i,genesis:manifest.genesi[i],program:new PublicKey(manifest.programs[i]),connection:new Connection('http://127.0.0.1:'+manifest.ports[i],'finalized')});
const sides=[side(0),side(1)];
for (const s of sides) {
  s.config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],s.program)[0];
  s.vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),s.config.toBuffer()],s.program)[0];
  s.programData=PublicKey.findProgramAddressSync([s.program.toBuffer()],new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'))[0];
  const nonce=Buffer.alloc(8);nonce.writeBigUInt64LE(s.i===0?1n:2n);
  s.event=PublicKey.findProgramAddressSync([Buffer.from('event'),s.config.toBuffer(),(s.i===0?originUser:nativeUser).toBuffer(),nonce],s.program)[0];
}
for (const s of sides) s.receipt=PublicKey.findProgramAddressSync([Buffer.from('claim'),s.config.toBuffer(),sides[1-s.i].event.toBuffer()],s.program)[0];
const escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),sides[0].config.toBuffer()],sides[0].program)[0];
const tokens=getAssociatedTokenAddressSync(mint,originUser,false,TOKEN);
const snapshotPath=root+'/checkpoint.json';
const reportPath=root+'/public-result.json';
let report=phase==='baseline'?{schemaVersion:1,scope:'Actual retained private source-built Agave ledgers; controlled SIGINT process/RPC outages and finalized state continuity, no broadcasts',startedAt:new Date().toISOString(),state:'running',productionReady:false,canonicalNetworkChanged:false,genesi:manifest.genesi,checks:[],broadcasts:0}:JSON.parse(readFileSync(reportPath));
const save=()=>writeFileSync(reportPath,JSON.stringify(report,null,2));
const pass=name=>{report.checks.push(name);save();console.log('PASS '+name);};
function expected(s) {return {bridge:bridge.toBase58(),sourceChain:s.genesis,destinationChain:sides[1-s.i].genesis,sourceProgram:s.program.toBase58(),destinationProgram:sides[1-s.i].program.toBase58(),recipient:(s.i===0?nativeUser:originUser).toBase58(),epoch:1n,direction:s.i};}
async function observe(s,minimumContextSlot=0) {return observeLocalEvent({rpc:s.connection.rpcEndpoint,expectedGenesis:s.genesis,eventAddress:s.event.toBase58(),expected:expected(s),minimumContextSlot});}
async function snapshot(s,minimumContextSlot=0) {
  assert.equal(await s.connection.getGenesisHash(),s.genesis);
  const addresses=[s.config,s.vault,s.program,s.programData,s.event,s.receipt,...(s.i===0?[escrow,tokens,mint]:[nativeUser])];
  const result=await s.connection.getMultipleAccountsInfoAndContext(addresses,{commitment:'finalized',minContextSlot:minimumContextSlot});
  assert(result.context.slot>=minimumContextSlot);
  const accounts=result.value.map((a,i)=>{assert(a,'Missing retained bridge account');return {address:addresses[i].toBase58(),owner:a.owner.toBase58(),lamports:a.lamports,executable:a.executable,bytes:a.data.length,dataSHA256:createHash('sha256').update(a.data).digest('hex')};});
  const config=result.value[0];assert(config.owner.equals(s.program));assert.equal(config.data.subarray(0,8).toString(),'SCCFG001');assert.equal(config.data.readBigUInt64LE(config.data.length-8),600_000n);
  const event=decodeEvent(result.value[4].data);assert.equal(event.sourceEvent,s.event.toBase58());
  assert(result.value[5].owner.equals(s.program));assert.equal(result.value[5].data.length,32);assert.deepEqual(result.value[5].data,sides[1-s.i].event.toBuffer());
  if(s.i===0){assert(result.value[6].owner.equals(TOKEN));assert.equal(result.value[6].data.readBigUInt64LE(64),600_000n);assert.equal(result.value[7].data.readBigUInt64LE(64),1_400_000n);}
  assert.equal(await s.connection.getGenesisHash(),s.genesis);
  return {contextSlot:result.context.slot,accounts};
}
async function compare(s,checkpoint) {
  const observed=await observe(s,checkpoint.contextSlot);
  assert.equal(observed.contextSlot>=checkpoint.contextSlot,true);
  const current=await snapshot(s,checkpoint.contextSlot);assert.deepEqual(current.accounts,checkpoint.accounts);
  return observed.event;
}
async function replay(s,event) {
  let instruction;
  if(s.i===1) instruction=nativeClaimInstruction({event,expected:event,payer,committee:members});
  else {
    const writable=p=>({pubkey:p,isWritable:true,isSigner:false});
    instruction=new TransactionInstruction({programId:s.program,data:Buffer.concat([Buffer.from([2]),encodeEvent(event)]),keys:[{pubkey:payer,isWritable:true,isSigner:true},writable(s.config),writable(s.vault),writable(s.receipt),writable(originUser),{pubkey:SystemProgram.programId,isWritable:false,isSigner:false},writable(escrow),writable(tokens),{pubkey:mint,isWritable:false,isSigner:false},{pubkey:TOKEN,isWritable:false,isSigner:false},...members.map(pubkey=>({pubkey,isWritable:false,isSigner:true}))]});
  }
  assert.equal(await s.connection.getGenesisHash(),s.genesis);
  const tx=new Transaction({feePayer:payer,...await s.connection.getLatestBlockhash('finalized')}).add(instruction);
  tx.sign(...['payer','committee0','committee1','committee2'].map(n=>Keypair.fromSecretKey(Uint8Array.from(manifest.keys[n]))));
  const sim=await s.connection.simulateTransaction(tx);
  assert.deepEqual(sim.value.err,{InstructionError:[0,'AccountAlreadyInitialized']});
  assert(sim.value.logs.some(line=>line.includes(s.program.toBase58())&&line.includes('invoke')));
  report.replayResults??=[];report.replayResults.push({side:s.i,error:sim.value.err,scope:'Actual compiled bridge simulation after restart; never broadcast'});
}
try {
  save();
  if(phase==='baseline') {
    const checkpoints=[];
    for(const s of sides){const o=await observe(s);checkpoints.push(await snapshot(s,o.contextSlot));}
    writeFileSync(snapshotPath,JSON.stringify(checkpoints,null,2));
    report.accountCounts=checkpoints.map(c=>c.accounts.length);
    pass('both retained genesi, finalized events, receipts, balances and 600000-unit counters verified');
  } else {
    const checkpoints=JSON.parse(readFileSync(snapshotPath));
    if(phase==='origin-outage'||phase==='native-outage') {
      const off=phase==='origin-outage'?0:1;
      await assert.rejects(observe(sides[off],checkpoints[off].contextSlot));
      assert.deepEqual((await snapshot(sides[1-off],checkpoints[1-off].contextSlot)).accounts,checkpoints[1-off].accounts);
      pass((off===0?'origin':'native')+' actual RPC outage refuses observation; other ledger remains unchanged');
    } else if(phase==='origin-recovered') {
      await compare(sides[0],checkpoints[0]);pass('origin restart preserves finalized event and all account bytes/lamports');
    } else {
      const events=[];for(const s of sides)events.push(await compare(s,checkpoints[s.i]));
      pass('both recovered ledgers preserve original finalized event PDAs, receipts and exact balances');
      await replay(sides[1],events[0]);await replay(sides[0],events[1]);pass('native release and original redemption replays still fail in the compiled bridge after restart');
      for(const s of sides)assert.deepEqual((await snapshot(s,checkpoints[s.i].contextSlot)).accounts,checkpoints[s.i].accounts);
      pass('rejected replay simulations do not alter escrow, reserve, receipts or counters');
      report.state='passed';report.completedAt=new Date().toISOString();save();
    }
  }
} catch(error) {report.state='failed';report.failure=String(error.message).slice(0,800);save();throw error;}
