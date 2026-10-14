// Run only inside the separate compiler worker against two fresh loopback ledgers.
// All keys are disposable synthetic fixtures; this is not a SOC launch.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID as TOKEN, createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, getAccount } from '@solana/spl-token';
import { decodeEvent, encodeEvent, observeLocalEvent, nativeClaimInstruction, PUBLIC_GENESIS } from './sdk.mjs';

const root='/data/bridge-rehearsal-v1';
const manifest=JSON.parse(readFileSync(root+'/private-input.json','utf8'));
if(manifest.scope!=='isolated-synthetic-two-chain') throw new Error('Private rehearsal input required');
const key=name=>Keypair.fromSecretKey(Uint8Array.from(manifest.keys[name]));
const payer=key('payer'), originUser=key('originUser'), nativeUser=key('nativeUser');
const members=Array.from({length:5},(_,i)=>key('committee'+i));
const bridge=new PublicKey(manifest.bridge);
const sides=[0,1].map(side=>({side,connection:new Connection('http://127.0.0.1:'+manifest.ports[side], 'finalized'),program:new PublicKey(manifest.programs[side]),genesis:manifest.genesi[side]}));
const proof={schemaVersion:1,scope:'two fresh source-built Agave 3.0.14 ledgers, synthetic funds and local co-signers',startedAt:new Date().toISOString(),state:'running',productionReady:false,canonicalNetworkChanged:false,genesi:manifest.genesi,signatures:[],checks:[]};
function save(){writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));}
function pass(name){proof.checks.push(name);save();console.log('PASS '+name);}
function k(value){return new PublicKey(value);}
function u64(n){const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;}
function meta(pubkey,isWritable=false,isSigner=false){return {pubkey:k(pubkey),isWritable,isSigner};}
async function admit(s){const g=await s.connection.getGenesisHash();assert.equal(g,s.genesis);assert(!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon');}
async function send(s,instructions,signers=[payer],reject=false){
  await admit(s);const latest=await s.connection.getLatestBlockhash('finalized');
  const transaction=new Transaction({feePayer:payer.publicKey,...latest}).add(...instructions);
  transaction.sign(...[...new Map([payer,...signers].map(v=>[v.publicKey.toBase58(),v])).values()]);
  const sim=await s.connection.simulateTransaction(transaction);
  if(reject){assert(sim.value.err,'Malicious transaction was accepted');return;}
  assert.equal(sim.value.err,null,JSON.stringify(sim.value.logs));await admit(s);
  // Each submission has a fresh blockhash. If submission/confirmation is uncertain,
  // stop and preserve receipts rather than generating a second bridge operation.
  const signature=await s.connection.sendRawTransaction(transaction.serialize(),{skipPreflight:false,maxRetries:2});
  proof.signatures.push({side:s.side,signature,state:'submitted'});save();
  const result=await s.connection.confirmTransaction({...latest,signature},'finalized');assert.equal(result.value.err,null);
  proof.signatures.at(-1).state='finalized';save();return signature;
}
function ix(s,keys,data){return new TransactionInstruction({programId:s.program,keys,data});}
function state(s){s.config=PublicKey.findProgramAddressSync([Buffer.from('config'),bridge.toBuffer()],s.program)[0];s.vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),s.config.toBuffer()],s.program)[0];s.escrow=PublicKey.findProgramAddressSync([Buffer.from('escrow'),s.config.toBuffer()],s.program)[0];}
function configBytes(s,mint){return Buffer.concat([Buffer.from('SCCFG001'),bridge.toBuffer(),k(s.genesis).toBuffer(),k(sides[1-s.side].genesis).toBuffer(),sides[1-s.side].program.toBuffer(),mint.toBuffer(),...members.map(v=>v.publicKey.toBuffer()),Buffer.from([6,9,s.side,3]),u64(1n),Buffer.from([1,1]),u64(2_000_000n),u64(4_000_000n),u64(0n),u64(0n),u64(0n)]);}
async function counter(s){const account=await s.connection.getAccountInfo(s.config,'finalized');assert(account&&account.owner.equals(s.program));return account.data.readBigUInt64LE(account.data.length-8);}
function deposit(s,sender,recipient,amount,nonce,token,mint){const event=PublicKey.findProgramAddressSync([Buffer.from('event'),s.config.toBuffer(),sender.publicKey.toBuffer(),u64(nonce)],s.program)[0];const accounts=[meta(sender.publicKey,true,true),meta(s.config,true),meta(s.vault,true),meta(event,true),meta(SystemProgram.programId)];if(s.side===0)accounts.push(meta(token,true),meta(s.escrow,true),meta(mint),meta(TOKEN));return {event,instruction:ix(s,accounts,Buffer.concat([Buffer.from([1]),u64(amount),u64(nonce),recipient.toBuffer()]))};}
async function observe(s,address,direction,recipient){const a=await s.connection.getAccountInfo(address,'finalized');assert(a);const event=decodeEvent(a.data);const expected={bridge:bridge.toBase58(),sourceChain:s.genesis,destinationChain:sides[1-s.side].genesis,sourceProgram:s.program.toBase58(),destinationProgram:sides[1-s.side].program.toBase58(),recipient:recipient.toBase58(),epoch:1n,direction};return (await observeLocalEvent({rpc:s.connection.rpcEndpoint,expectedGenesis:s.genesis,eventAddress:address.toBase58(),expected})).event;}
function claim(s,event,mint,token,co=members.slice(0,3)){
  if(s.side===1&&co.length===3)return nativeClaimInstruction({event,expected:event,payer:payer.publicKey,committee:co.map(v=>v.publicKey)});
  const receipt=PublicKey.findProgramAddressSync([Buffer.from('claim'),s.config.toBuffer(),k(event.sourceEvent).toBuffer()],s.program)[0];const accounts=[meta(payer.publicKey,true,true),meta(s.config,true),meta(s.vault,true),meta(receipt,true),meta(event.recipient,true),meta(SystemProgram.programId)];if(s.side===0)accounts.push(meta(s.escrow,true),meta(token,true),meta(mint),meta(TOKEN));accounts.push(...co.map(v=>meta(v.publicKey,false,true)));return ix(s,accounts,Buffer.concat([Buffer.from([2]),encodeEvent(event)]));
}
try {
  save();await Promise.all(sides.map(admit));assert.notEqual(sides[0].genesis,sides[1].genesis);pass('two distinct fresh genesi; no public or soaking network');
  const origin=sides[0],native=sides[1];for(const s of sides)state(s);
  await send(origin,[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:originUser.publicKey,lamports:1_000_000_000})]);
  await send(native,[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:nativeUser.publicKey,lamports:100_000_000})]);
  await admit(origin);const mint=await createMint(origin.connection,payer,payer.publicKey,null,6,undefined,{commitment:'finalized'},TOKEN);
  const source=await getOrCreateAssociatedTokenAccount(origin.connection,payer,mint,originUser.publicKey,false,'finalized',undefined,TOKEN);
  await mintTo(origin.connection,payer,mint,source.address,payer,2_000_000n,[],{commitment:'finalized'},TOKEN);
  await setAuthority(origin.connection,payer,mint,payer,AuthorityType.MintTokens,null,[],{commitment:'finalized'},TOKEN);
  proof.mint=mint.toBase58();pass('immutable synthetic Token-2022 mint created on isolated origin');
  for(const s of sides){const pd=PublicKey.findProgramAddressSync([s.program.toBuffer()],new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'))[0];const accounts=[meta(payer.publicKey,true,true),meta(s.config,true),meta(s.vault,true),meta(s.side===0?s.escrow:payer.publicKey,true),meta(s.side===0?mint:payer.publicKey),meta(TOKEN),meta(SystemProgram.programId),meta(s.program),meta(pd)];await send(s,[ix(s,accounts,Buffer.concat([Buffer.from([0]),configBytes(s,mint)]))]);}
  const lock=deposit(origin,originUser,nativeUser.publicKey,1_000_000n,1n,source.address,mint);
  await send(origin,[lock.instruction],[originUser],true);pass('initial pause rejects deposits');
  for(const s of sides)await send(s,[ix(s,[meta(s.config,true),...members.slice(0,3).map(v=>meta(v.publicKey,false,true))],Buffer.from([3,0,0]))],members.slice(0,3));
  await send(origin,[lock.instruction],[originUser]);const locked=await observe(origin,lock.event,0,nativeUser.publicKey);assert.equal(locked.originAmount,1_000_000n);pass('finalized lock observed from actual event PDA');
  await send(native,[claim(native,locked,mint,source.address)],members.slice(0,3),true);assert.equal(await counter(native),0n);pass('empty reserve rejects release atomically');
  await send(native,[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:native.vault,lamports:2_000_000_000})]);
  await send(native,[claim(native,locked,mint,source.address,members.slice(0,2))],members.slice(0,2),true);pass('two signers cannot settle; committee outage retains locked escrow');
  await send(native,[claim(native,{...locked,destinationChain:Keypair.generate().publicKey.toBase58()},mint,source.address)],members.slice(0,3),true);pass('wrong destination domain rejected');
  const before=await native.connection.getBalance(nativeUser.publicKey,'finalized');
  await send(native,[claim(native,locked,mint,source.address)],members.slice(0,3));assert.equal(await native.connection.getBalance(nativeUser.publicKey,'finalized')-before,1_000_000_000);pass('three actual transaction co-signers release exact 1:1 native units');
  await send(native,[claim(native,locked,mint,source.address)],members.slice(0,3),true);pass('duplicate native release rejected');
  const back=deposit(native,nativeUser,originUser.publicKey,400_000n,2n,null,mint);await send(native,[back.instruction],[nativeUser]);const returned=await observe(native,back.event,1,originUser.publicKey);pass('finalized native return observed on second real ledger');
  await send(origin,[claim(origin,returned,mint,source.address)],members.slice(0,3));pass('original synthetic tokens redeemed');
  await send(origin,[claim(origin,returned,mint,source.address)],members.slice(0,3),true);await send(origin,[lock.instruction],[originUser],true);pass('duplicate redemption and source nonce rejected');
  const escrow=(await getAccount(origin.connection,origin.escrow,'finalized',TOKEN)).amount;const remaining=(await getAccount(origin.connection,source.address,'finalized',TOKEN)).amount;
  assert.equal(escrow,600_000n);assert.equal(remaining,1_400_000n);assert.equal(await counter(origin),escrow);assert.equal(await counter(native),escrow);
  proof.reconciliation={originEscrowUnits:String(escrow),originUserUnits:String(remaining),nativeOutstandingOriginUnits:String(await counter(native)),originOutstandingUnits:String(await counter(origin)),originDecimals:6,nativeDecimals:9};pass('both bridge counters and actual escrow reconcile after partial round trip');
  proof.state='passed';proof.completedAt=new Date().toISOString();save();
} catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,1200);proof.completedAt=new Date().toISOString();save();console.error(error);process.exitCode=1;}
