// Run only inside the separate compiler worker against two fresh loopback ledgers.
// All keys are disposable synthetic fixtures; this is not a SOC launch.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID as TOKEN, createMint, getOrCreateAssociatedTokenAccount, mintTo, setAuthority, AuthorityType, getAccount } from '@solana/spl-token';
import { bootstrapInstruction,decodeBootstrapRecord } from '../bootstrap.mjs';
import { decodeEvent, encodeEvent, observeLocalEvent, nativeClaimInstruction, PUBLIC_GENESIS } from '../sdk.mjs';

const root='/data/bridge-bootstrap-v2';
const manifest=JSON.parse(readFileSync(root+'/private-input.json','utf8'));
if(manifest.scope!=='isolated-synthetic-bootstrap-v2') throw new Error('Private rehearsal input required');
const key=name=>Keypair.fromSecretKey(Uint8Array.from(manifest.keys[name]));
const payer=key('payer'), originUser=key('originUser'), nativeUser=key('nativeUser');
const members=Array.from({length:5},(_,i)=>key('committee'+i));
const bridge=new PublicKey(manifest.bridge);
const sides=[0,1].map(side=>({side,connection:new Connection('http://127.0.0.1:'+manifest.ports[side], 'finalized'),program:new PublicKey(manifest.programs[side]),genesis:manifest.genesi[side]}));
const proof={schemaVersion:1,scope:'Two fresh private source-built Agave 3.0.14 test-validator ledgers; V2 bootstrap wire/state execution using a synthetic committee-attested budget, not complete ledger/genesis backing',startedAt:new Date().toISOString(),state:'running',productionReady:false,canonicalNetworkChanged:false,genesi:manifest.genesi,signatures:[],checks:[]};
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
  const elf=readFileSync(root+'/bridge.so'),loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');proof.programs=[];
  for(const s of sides){const program=await s.connection.getAccountInfo(s.program,'finalized');assert(program.executable&&program.owner.equals(loader));const pd=PublicKey.findProgramAddressSync([s.program.toBuffer()],loader)[0];assert(program.data.subarray(4,36).equals(pd.toBuffer()));const data=await s.connection.getAccountInfo(pd,'finalized');assert(data.owner.equals(loader)&&data.data[12]===1&&data.data.subarray(13,45).equals(payer.publicKey.toBuffer()));assert(data.data.subarray(45,45+elf.length).equals(elf));assert(data.data.subarray(45+elf.length).every(v=>v===0));proof.programs.push({program:s.program.toBase58(),programData:pd.toBase58(),upgradeAuthority:payer.publicKey.toBase58(),sha256:createHash('sha256').update(data.data.subarray(45,45+elf.length)).digest('hex')});}
  pass('Both finalized upgradeable programs match exact V2 bytes and pinned local authority');
  await send(origin,[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:originUser.publicKey,lamports:1_000_000_000})]);
  await send(native,[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:nativeUser.publicKey,lamports:100_000_000})]);
  await admit(origin);const mint=await createMint(origin.connection,payer,payer.publicKey,null,6,undefined,{commitment:'finalized'},TOKEN);
  const source=await getOrCreateAssociatedTokenAccount(origin.connection,payer,mint,originUser.publicKey,false,'finalized',undefined,TOKEN);
  await mintTo(origin.connection,payer,mint,source.address,payer,2_000_000n,[],{commitment:'finalized'},TOKEN);
  await setAuthority(origin.connection,payer,mint,payer,AuthorityType.MintTokens,null,[],{commitment:'finalized'},TOKEN);
  proof.mint=mint.toBase58();pass('immutable synthetic Token-2022 mint created on isolated origin');
  for(const s of sides){const pd=PublicKey.findProgramAddressSync([s.program.toBuffer()],new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'))[0];const accounts=[meta(payer.publicKey,true,true),meta(s.config,true),meta(s.vault,true),meta(s.side===0?s.escrow:payer.publicKey,true),meta(s.side===0?mint:payer.publicKey),meta(TOKEN),meta(SystemProgram.programId),meta(s.program),meta(pd)];await send(s,[ix(s,accounts,Buffer.concat([Buffer.from([0]),configBytes(s,mint)]))]);}
  assert.equal((await native.connection.getAccountInfo(native.vault,'finalized')).data.length,16);
  const initial=await native.connection.getAccountInfo(native.vault,'finalized');assert.equal(initial.data.subarray(0,8).toString(),'SCVLT002');
  const minimum=await native.connection.getMinimumBalanceForRentExemption(16,'finalized');assert.equal(minimum,1_002_240);
  await send(native,[SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:native.vault,lamports:1_900_000_000-initial.lamports})]);
  assert.equal(await native.connection.getBalance(native.vault,'finalized'),1_900_000_000);pass('V2 native vault funded to exact bounded reserve through actual system transfer');
  const co=members.slice(0,3),pause=(s,on)=>ix(s,[meta(s.config,true),...co.map(v=>meta(v.publicKey,false,true))],Buffer.from([3,Number(on),Number(on)]));
  await send(origin,[pause(origin,false)],co);
  const lock=deposit(origin,originUser,native.vault,102_000n,1n,source.address,mint);
  await send(origin,[lock.instruction],[originUser]);const locked=await observe(origin,lock.event,0,native.vault);assert.equal(locked.originAmount,102_000n);
  assert.equal((await getAccount(origin.connection,origin.escrow,'finalized',TOKEN)).amount,102_000n);assert.equal(await counter(origin),102_000n);pass('Actual immutable source lock to native vault, finalized escrow and origin counter agree');
  const row=(address,lamports)=>({address,lamports,owner:SystemProgram.programId.toBase58(),dataBytes:0,executable:false});
  // Explicit hypothetical inventory projection: these TWO rows do not enumerate
  // the test-validator's global accounts. Committee trust is tested, not genesis.
  const accountingInput={schemaVersion:1,environment:'isolated-rehearsal',originMint:mint.toBase58(),originDecimals:6,nativeDecimals:9,originSupplyUnits:'2000000',prelockedOriginUnits:'102000',reserveAddress:native.vault.toBase58(),reserveDataBytes:16,protectedReserveNativeUnits:'1002240',declaredOriginCounterUnits:'102000',declaredNativeCounterUnits:'102000',genesisAudit:{genesis:native.genesis,clusterType:'development',accountCount:2,totalLamports:'2000000000',accounts:[row(native.vault.toBase58(),'1900000000'),row(nativeUser.publicKey.toBase58(),'100000000')],inflation:{initial:0,terminal:0,taper:0,foundation:0,foundationTerm:0,unused:0},feeRateGovernor:{burnPercent:0},rent:{burn_percent:0,exemption_threshold:2,lamports_per_byte_year:3480}}};
  const prepared=bootstrapInstruction({event:locked,expected:locked,payer:payer.publicKey,committee:co.map(v=>v.publicKey),accountingInput});
  proof.globalBacking={completeInventoryVerified:false,actualGenesisBackingVerified:false,hypotheticalNativeBudgetUnits:'2000000000',observedNativeGlobalSupplyUnitsAtStart:manifest.nativeGlobalSupplyUnitsAtStart,budgetMatchesObservedGlobalSupply:manifest.nativeGlobalSupplyUnitsAtStart==='2000000000',note:'Synthetic 2-row accounting projection intentionally does not cover the complete test-validator supply. Cannot pass B3 or any monetary-release gate.'};assert.equal(proof.globalBacking.budgetMatchesObservedGlobalSupply,false);
  const bootstrapIx=prepared.instruction,receipt=bootstrapIx.keys[3].pubkey,record=bootstrapIx.keys[4].pubkey;
  const malformed=new TransactionInstruction({programId:bootstrapIx.programId,keys:bootstrapIx.keys,data:Buffer.from(bootstrapIx.data)});malformed.data.writeBigUInt64LE(2_000_000_001n,338);
  await send(native,[malformed],co,true);assert.equal(await counter(native),0n);assert.equal(await native.connection.getAccountInfo(record,'finalized'),null);pass('Malformed total budget rejects without bootstrap record or native counter change');
  const incomplete=new TransactionInstruction({programId:bootstrapIx.programId,keys:bootstrapIx.keys.filter(v=>!v.pubkey.equals(co[2].publicKey)),data:bootstrapIx.data});
  await send(native,[incomplete],co.slice(0,2),true);pass('Two actual committee signatures cannot bootstrap');
  const before=await native.connection.getBalance(native.vault,'finalized'),userBefore=await native.connection.getBalance(nativeUser.publicKey,'finalized');
  await send(native,[bootstrapIx],co);assert.equal(await native.connection.getBalance(native.vault,'finalized'),before);assert.equal(await native.connection.getBalance(nativeUser.publicKey,'finalized'),userBefore);assert.equal(await counter(native),102_000n);assert.equal(await counter(origin),102_000n);
  const saved=await native.connection.getAccountInfo(record,'finalized');assert(saved.owner.equals(native.program));const decoded=decodeBootstrapRecord(saved.data);assert.equal(decoded.originAmount,102_000n);assert.equal(decoded.protectedNative,2_000_000n);assert.equal(decoded.inventorySHA256,prepared.accounting.inventorySHA256);assert.equal(decoded.sourceEvent,locked.sourceEvent);
  const consumed=await native.connection.getAccountInfo(receipt,'finalized');assert(consumed.owner.equals(native.program));assert(consumed.data.equals(k(locked.sourceEvent).toBuffer()));pass('Finalized bootstrap sets matching initial counters and consumed receipt without native release');
  await send(native,[bootstrapIx],co,true);pass('Second bootstrap transaction rejects');
  await send(native,[pause(native,false)],co);
  await send(native,[claim(native,locked,mint,source.address)],co,true);
  await send(native,[claim(native,{...locked,recipient:nativeUser.publicKey.toBase58()},mint,source.address)],co,true);pass('Bootstrap backing cannot be released again, including changed recipient');
  const next=deposit(origin,originUser,nativeUser.publicKey,1_898_000n,2n,source.address,mint);await send(origin,[next.instruction],[originUser]);const nextEvent=await observe(origin,next.event,0,nativeUser.publicKey);
  const nextReceipt=PublicKey.findProgramAddressSync([Buffer.from('claim'),native.config.toBuffer(),k(nextEvent.sourceEvent).toBuffer()],native.program)[0];
  await send(native,[claim(native,{...nextEvent,originAmount:1_898_001n},mint,source.address)],co,true);assert.equal(await native.connection.getAccountInfo(nextReceipt,'finalized'),null);assert.equal(await counter(native),102_000n);assert.equal(await native.connection.getBalance(native.vault,'finalized'),1_900_000_000);pass('Release exceeding protected floor rejects atomically even when reserve remains above rent');
  const userStart=await native.connection.getBalance(nativeUser.publicKey,'finalized');await send(native,[claim(native,nextEvent,mint,source.address)],co);
  assert.equal(await native.connection.getBalance(nativeUser.publicKey,'finalized')-userStart,1_898_000_000);assert.equal(await native.connection.getBalance(native.vault,'finalized'),2_000_000);assert.equal(await counter(native),2_000_000n);assert.equal(await counter(origin),2_000_000n);pass('Exact future source deposit releases only unprotected reserve capacity');
  const back=deposit(native,nativeUser,originUser.publicKey,50_000n,3n,null,mint);await send(native,[back.instruction],[nativeUser]);const returned=await observe(native,back.event,1,originUser.publicKey);await send(origin,[claim(origin,returned,mint,source.address)],co);
  const escrow=(await getAccount(origin.connection,origin.escrow,'finalized',TOKEN)).amount,remaining=(await getAccount(origin.connection,source.address,'finalized',TOKEN)).amount;
  assert.equal(escrow,1_950_000n);assert.equal(remaining,50_000n);assert.equal(await counter(origin),escrow);assert.equal(await counter(native),escrow);assert.equal(await native.connection.getBalance(native.vault,'finalized'),52_000_000);pass('Native return and original redemption reconcile both counters after bootstrap');
  await send(origin,[claim(origin,returned,mint,source.address)],co,true);pass('Original redemption replay rejects on actual ledger');
  proof.reconciliation={originEscrowUnits:String(escrow),originUserUnits:String(remaining),nativeOutstandingOriginUnits:String(await counter(native)),originOutstandingUnits:String(await counter(origin)),originDecimals:6,nativeDecimals:9,initialPrelockOriginUnits:'102000',protectedFloorNativeUnits:'2000000',finalReserveNativeUnits:'52000000',bootstrapRecord:record.toBase58(),bootstrapReceipt:receipt.toBase58(),bootstrapInventorySHA256:decoded.inventorySHA256};
  proof.state='passed';proof.completedAt=new Date().toISOString();save();
} catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,1200);proof.completedAt=new Date().toISOString();save();console.error(error);process.exitCode=1;}
