import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicKey,Keypair} from '@solana/web3.js';
import {observeNativeReserve} from './native-reserve.mjs';
import {PUBLIC_GENESIS} from './sdk.mjs';
const loader='BPFLoaderUpgradeab1e11111111111111111111111',sysvar='Sysvar1111111111111111111111111111111111111',hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const k=()=>Keypair.generate().publicKey.toBase58(),pins={genesis:k(),remoteGenesis:k(),program:k(),remoteProgram:k(),bridge:k(),originMint:k(),side:1,upgradeAuthority:k()};
 const pd=PublicKey.findProgramAddressSync([new PublicKey(pins.program).toBuffer()],new PublicKey(loader))[0],configKey=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(pins.bridge).toBuffer()],new PublicKey(pins.program))[0],event=new PublicKey(k());
 const receiptKey=PublicKey.findProgramAddressSync([Buffer.from('claim'),configKey.toBuffer(),event.toBuffer()],new PublicKey(pins.program))[0].toBase58();
 const program=Buffer.alloc(36);program.writeUInt32LE(2);pd.toBuffer().copy(program,4);
 const elf=Buffer.from('7f454c4601020304','hex'),code=Buffer.alloc(45+elf.length);code.writeUInt32LE(3);code[12]=1;new PublicKey(pins.upgradeAuthority).toBuffer().copy(code,13);elf.copy(code,45);pins.elfBytes=elf.length;pins.elfSHA256=hash(elf);pins.programDataSHA256=hash(code);
 const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,v] of [[8,pins.bridge],[40,pins.genesis],[72,pins.remoteGenesis],[104,pins.remoteProgram],[136,pins.originMint]])new PublicKey(v).toBuffer().copy(config,o);
 for(let i=0;i<5;i++)new PublicKey(k()).toBuffer().copy(config,168+i*32);config[328]=6;config[329]=9;config[330]=1;config[331]=3;config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2000000n,342);config.writeBigUInt64LE(4000000n,350);config.writeBigUInt64LE(1950000n,374);pins.policySHA256=hash(config.subarray(0,358));
 const bootstrap={originSupplyUnits:'2000000',totalNativeUnits:'2000000000',outsideNativeUnits:'100000000',initialReserveNativeUnits:'1900000000',originAmount:'102000',protectedNativeUnits:'2000000',inventorySHA256:'1'.repeat(64),receipt:receiptKey};
 const vault=Buffer.alloc(16);vault.write('SCVLT002');vault.writeBigUInt64LE(2000000n,8);
 const record=Buffer.alloc(120);record.write('SCBST001');Buffer.from(bootstrap.inventorySHA256,'hex').copy(record,8);for(const [i,f] of ['originSupplyUnits','totalNativeUnits','outsideNativeUnits','initialReserveNativeUnits'].entries())record.writeBigUInt64LE(BigInt(bootstrap[f]),40+i*8);event.toBuffer().copy(record,72);record.writeBigUInt64LE(102000n,104);record.writeBigUInt64LE(2000000n,112);
 const receipt=event.toBuffer(),rent=Buffer.alloc(17);rent.writeBigUInt64LE(3480n);rent.writeDoubleLE(2,8);rent[16]=50;
 const calls=[],account=(b,owner,executable=false)=>({lamports:1n,owner,executable,data:[b.toString('base64'),'base64']});let context=50,nativeReads=0,mutate=()=>{},balance=52000000n;
 const fetcher=async(url,options)=>{
  const q=JSON.parse(options.body);calls.push(q);const native=q.method==='getMultipleAccounts'&&q.params[0][0]===configKey.toBase58();if(native)nativeReads++;mutate(q,native,nativeReads);
  let result;if(q.method==='getGenesisHash')result=pins.genesis;else if(q.method==='getMultipleAccounts')result={context:{slot:++context},value:native?[account(config,pins.program),{...account(vault,pins.program),lamports:balance},account(record,pins.program),account(receipt,pins.program),account(rent,sysvar)]:[account(program,loader,true),account(code,loader),account(config,pins.program)]};else throw Error('Unexpected request');
  return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result},(_,v)=>typeof v==='bigint'?JSON.rawJSON(v.toString()):v));
 };
 return {pins,config,code,vault,record,receipt,rent,bootstrap,calls,fetcher,balance:v=>{balance=v;},mutate:f=>{mutate=f;},options:{rpc:'http://127.0.0.1:21899',pins,bootstrap,originDecimals:6,minimumContextSlot:50}};
}
test('bootstrap receipt, record, exact capacity and protected rent reconcile without mutations',async()=>{
 const f=fixture(),r=await observeNativeReserve(f.options,f.fetcher);assert.equal(r.reserveNativeUnits,'52000000');assert.equal(r.minimumReconciledReserveNativeUnits,'52000000');assert.equal(r.protectedFloorNativeUnits,'2000000');assert.equal(r.minimumVaultRentNativeUnits,'1002240');assert.equal(r.unallocatedNativeSurplusUnits,'0');assert.equal(r.nativeOutstandingOriginUnits,'1950000');assert(r.consumedBootstrapReceiptVerified&&r.protectedFloorVerified);assert.equal(r.completeGenesisBackingVerified,false);assert.equal(r.originalEscrowVerified,false);assert.equal(r.canBroadcast,false);assert(f.calls.every(q=>['getGenesisHash','getMultipleAccounts'].includes(q.method)));assert.equal(r.assetSnapshots,2);assert.equal(r.codeObservations,4);assert(!Object.hasOwn(r,'rpc'));
});
test('large native u64 metadata is exact and donations remain unallocated surplus',async()=>{
 const f=fixture(),n=18446744073709551615n;f.balance(n);const r=await observeNativeReserve(f.options,f.fetcher);assert.equal(r.reserveNativeUnits,String(n));assert.equal(r.unallocatedNativeSurplusUnits,String(n-52000000n));
});
test('one-unit underfunding cannot pass even though the protected floor alone is covered',async()=>{const f=fixture();f.balance(51999999n);await assert.rejects(observeNativeReserve(f.options,f.fetcher),/cannot cover/);});
test('altered inventory, supply, total, outside allocation or initial reserve fails independently selected record binding',async()=>{
 for(const offset of [8,40,48,56,64]){const f=fixture();f.record[offset]^=1;await assert.rejects(observeNativeReserve(f.options,f.fetcher),/bootstrap record|reviewed amounts/);}
});
test('missing, substituted or inconsistent consumed bootstrap event cannot pass',async()=>{
 for(const mode of ['event','receipt','amount','protected']){const f=fixture();if(mode==='event')f.record[72]^=1;if(mode==='receipt')f.receipt[0]^=1;if(mode==='amount')f.record[104]^=1;if(mode==='protected')f.record[112]^=1;await assert.rejects(observeNativeReserve(f.options,f.fetcher),/source event/);}
});
test('vault floor and required rent cannot be reduced behind an unchanged programme address',async()=>{
 const f=fixture();f.vault.writeBigUInt64LE(1999999n,8);await assert.rejects(observeNativeReserve(f.options,f.fetcher),/floor/);
 const g=fixture();g.rent.writeBigUInt64LE(100000n,0);await assert.rejects(observeNativeReserve(g.options,g.fetcher),/floor/);
});
test('unsupported rent precision, burn or arithmetic range fails closed',async()=>{
 for(const mode of ['fraction','nan','burn','large']){const f=fixture();if(mode==='fraction')f.rent.writeDoubleLE(2.1,8);if(mode==='nan')f.rent.writeDoubleLE(NaN,8);if(mode==='burn')f.rent[16]=101;if(mode==='large')f.rent.writeBigUInt64LE(18446744073709551615n);await assert.rejects(observeNativeReserve(f.options,f.fetcher),/rent/);}
});
test('native obligations cannot exceed the declared original supply',async()=>{const f=fixture();f.config.writeBigUInt64LE(2000001n,374);await assert.rejects(observeNativeReserve(f.options,f.fetcher),/obligations/);});
test('counter or reserve movement between finalized reads cannot yield a stable report',async()=>{
 for(const mode of ['counter','balance']){const f=fixture();f.mutate((q,native,n)=>{if(native&&n===2){if(mode==='counter')f.config.writeBigUInt64LE(1950001n,374);else f.balance(52000001n);}});await assert.rejects(observeNativeReserve(f.options,f.fetcher),/changed/);}
});
test('code or obligation change during the final pin observation cannot inherit old success',async()=>{
 for(const mode of ['code','counter']){const f=fixture();f.mutate((q,native,n)=>{if(!native&&q.method==='getMultipleAccounts'&&n===2){if(mode==='code')f.code[45]^=1;else f.config.writeBigUInt64LE(1950001n,374);}});await assert.rejects(observeNativeReserve(f.options,f.fetcher),/programme account|obligations changed/);}
});
test('caller mutation cannot replace the captured witness during asynchronous reads',async()=>{
 const f=fixture();f.mutate((q,native,n)=>{if(native&&n===1){f.record[8]^=1;f.bootstrap.inventorySHA256=f.record.subarray(8,40).toString('hex');}});await assert.rejects(observeNativeReserve(f.options,f.fetcher),/bootstrap record/);
});
test('public/canonical chains, origin side, remote endpoints and invalid budget cannot initiate reads',async()=>{
 for(const mode of ['public','canonical','origin','remote','query','number','overflow','zero','precision','arithmetic','checkpoint']){const f=fixture(),o=f.options;if(mode==='public')f.pins.genesis=[...PUBLIC_GENESIS][0];if(mode==='canonical')f.pins.genesis='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';if(mode==='origin')f.pins.side=0;if(mode==='remote')o.rpc='https://example.com';if(mode==='query')o.rpc+='/?secret=1';if(mode==='number')o.bootstrap.originSupplyUnits=2000000;if(mode==='overflow')o.bootstrap.totalNativeUnits='18446744073709551616';if(mode==='zero')o.bootstrap.originAmount='0';if(mode==='precision')o.originDecimals=10;if(mode==='arithmetic')o.bootstrap.initialReserveNativeUnits='1900000001';if(mode==='checkpoint')o.minimumContextSlot=-1;await assert.rejects(observeNativeReserve(o,f.fetcher));assert.equal(f.calls.length,0);}
});
test('wrong owners, malformed data, absent accounts and stale or oversized responses reject',async()=>{
 for(const mode of ['owner','executable','base64','missing','stale','oversized','outage']){const f=fixture();const fetcher=async(...args)=>{const q=JSON.parse(args[1].body),native=q.method==='getMultipleAccounts'&&q.params[0][0]!==f.pins.program;if(!native)return f.fetcher(...args);if(mode==='outage')throw Error('Unavailable');if(mode==='oversized')return new Response(' '.repeat(32769));const raw=await(await f.fetcher(...args)).text();const w=JSON.parse(raw);if(mode==='owner')w.result.value[2].owner=sysvar;if(mode==='executable')w.result.value[1].executable=true;if(mode==='base64')w.result.value[3].data[0]+=' ';if(mode==='missing')w.result.value[3]=null;if(mode==='stale')w.result.context.slot=0;return new Response(JSON.stringify(w));};await assert.rejects(observeNativeReserve(f.options,fetcher));}
});
test('native balance strings, fractions, exponents, negative values and overflow reject instead of rounding',async()=>{
 for(const value of ['"52000000"','52000000.0','5.2e7','-1','18446744073709551616']){const f=fixture(),fetcher=async(...args)=>{const q=JSON.parse(args[1].body),r=await f.fetcher(...args);if(q.method!=='getMultipleAccounts'||q.params[0][0]===f.pins.program)return r;const raw=await r.text();return new Response(raw.replace('"lamports":52000000','"lamports":'+value));};await assert.rejects(observeNativeReserve(f.options,fetcher),/numeric|u64/);}
});
