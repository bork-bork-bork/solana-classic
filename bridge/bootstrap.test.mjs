import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey,Transaction,Keypair } from '@solana/web3.js';
import { bootstrapInstruction,decodeBootstrapRecord } from './bootstrap.mjs';
const k=i=>new PublicKey(Uint8Array.from({length:32},(_,j)=>(i+j)%256)).toBase58();
function fixture(){
  const e={bridge:k(1),sourceChain:k(2),destinationChain:k(3),sourceProgram:k(4),destinationProgram:k(5),sender:k(6),originAmount:102_000n,nonce:1n,slot:20n,epoch:1n,direction:0};
  const pda=(seeds,p)=>PublicKey.findProgramAddressSync(seeds.map(v=>Buffer.from(v)),new PublicKey(p))[0];
  const sc=pda([Buffer.from('config'),new PublicKey(e.bridge).toBuffer()],e.sourceProgram);
  const dc=pda([Buffer.from('config'),new PublicKey(e.bridge).toBuffer()],e.destinationProgram);
  const nonce=Buffer.alloc(8);nonce.writeBigUInt64LE(e.nonce);
  e.sourceEvent=pda([Buffer.from('event'),sc.toBuffer(),new PublicKey(e.sender).toBuffer(),nonce],e.sourceProgram).toBase58();
  e.recipient=pda([Buffer.from('vault'),dc.toBuffer()],e.destinationProgram).toBase58();
  const row=(address,lamports)=>({address,lamports,owner:'11111111111111111111111111111111',dataBytes:0,executable:false});
  const accountingInput={schemaVersion:1,environment:'isolated-rehearsal',originMint:k(40),originDecimals:6,nativeDecimals:9,originSupplyUnits:'2000000',prelockedOriginUnits:'102000',reserveAddress:e.recipient,reserveDataBytes:16,protectedReserveNativeUnits:'1002240',declaredOriginCounterUnits:'102000',declaredNativeCounterUnits:'102000',genesisAudit:{genesis:e.destinationChain,clusterType:'development',accountCount:2,totalLamports:'2000000000',accounts:[row(e.recipient,'1900000000'),row(k(99),'100000000')],inflation:{initial:0,terminal:0,taper:0,foundation:0,foundationTerm:0,unused:0},feeRateGovernor:{burnPercent:0},rent:{burn_percent:0,exemption_threshold:2,lamports_per_byte_year:3480}}};
  return {event:e,expected:{...e},payer:k(8),committee:[k(9),k(10),k(11)],accountingInput};
}
test('bootstrap unsigned codec binds complete audit, counters and normal replay receipt',()=>{
  const f=fixture(),r=bootstrapInstruction(f),ix=r.instruction;
  assert.equal(ix.data.length,362);assert.equal(ix.data[0],4);assert.equal(ix.keys.length,11);assert.equal(ix.keys.filter(k=>k.isSigner).length,4);
  assert.equal(ix.data.subarray(298,330).toString('hex'),r.accounting.inventorySHA256);
  assert.equal(ix.data.readBigUInt64LE(330),2_000_000n);assert.equal(r.activationEnabled,false);assert.equal(r.productionReady,false);
  const normal=PublicKey.findProgramAddressSync([Buffer.from('claim'),ix.keys[1].pubkey.toBuffer(),new PublicKey(f.event.sourceEvent).toBuffer()],ix.programId)[0];assert(ix.keys[3].pubkey.equals(normal));
});
test('incorrect backing, zero counters, V1 rent/size and different inventory are refused',()=>{
  for(const mutate of [f=>f.accountingInput.declaredNativeCounterUnits='0',f=>f.event.originAmount++,f=>f.accountingInput.reserveDataBytes=8,f=>f.accountingInput.genesisAudit.genesis=k(88),f=>f.accountingInput.reserveAddress=k(77),f=>f.accountingInput.genesisAudit.accounts[0].lamports='1900000001']){const f=fixture();mutate(f);assert.throws(()=>bootstrapInstruction(f));}
});
test('wrong recipient, direction, epoch, source PDA, quorum and public identities fail',()=>{
  for(const mutate of [f=>f.event.recipient=k(77),f=>f.event.direction=1,f=>f.event.epoch=2n,f=>f.event.sourceEvent=k(77),f=>f.committee[1]=f.committee[0],f=>f.committee[1]=f.payer,f=>{f.event.sourceChain='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';f.expected.sourceChain=f.event.sourceChain;}]){const f=fixture();mutate(f);assert.throws(()=>bootstrapInstruction(f));}
});
test('bootstrap record decoder exactly matches the Borsh witness and rejects ambiguity',()=>{
  const f=fixture(),r=bootstrapInstruction(f),amount=Buffer.alloc(8),floor=Buffer.alloc(8);amount.writeBigUInt64LE(102_000n);floor.writeBigUInt64LE(2_000_000n);
  const bytes=Buffer.concat([Buffer.from('SCBST001'),r.instruction.data.subarray(298),new PublicKey(f.event.sourceEvent).toBuffer(),amount,floor]);
  const decoded=decodeBootstrapRecord(bytes);assert.equal(decoded.originAmount,102_000n);assert.equal(decoded.protectedNative,2_000_000n);assert.equal(decoded.sourceEvent,f.event.sourceEvent);assert.equal(decoded.inventorySHA256,r.accounting.inventorySHA256);
  assert.throws(()=>decodeBootstrapRecord(Buffer.concat([bytes,Buffer.from([0])])));bytes[0]=0;assert.throws(()=>decodeBootstrapRecord(bytes));
});
test('four-signature bootstrap fits one bounded legacy transaction',()=>{
  const f=fixture(),signers=Array.from({length:4},()=>Keypair.generate());f.payer=signers[0].publicKey.toBase58();f.committee=signers.slice(1).map(k=>k.publicKey.toBase58());
  const tx=new Transaction({feePayer:signers[0].publicKey,recentBlockhash:k(70)}).add(bootstrapInstruction(f).instruction);tx.sign(...signers);
  assert(tx.serialize().length<=1232); // Ephemeral keys remain in test memory.
});
