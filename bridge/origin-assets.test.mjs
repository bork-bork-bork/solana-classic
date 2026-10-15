import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PublicKey,Keypair} from '@solana/web3.js';
import {observeOriginAssets} from './origin-assets.mjs';
import {TOKEN_2022,PUBLIC_GENESIS} from './sdk.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),loader='BPFLoaderUpgradeab1e11111111111111111111111';
function fixture(){
  const k=()=>Keypair.generate().publicKey.toBase58();
  const pins={genesis:k(),remoteGenesis:k(),program:k(),remoteProgram:k(),bridge:k(),originMint:k(),side:0,upgradeAuthority:k()};
  const pd=PublicKey.findProgramAddressSync([new PublicKey(pins.program).toBuffer()],new PublicKey(loader))[0];
  const configKey=PublicKey.findProgramAddressSync([Buffer.from('config'),new PublicKey(pins.bridge).toBuffer()],new PublicKey(pins.program))[0];
  const vaultKey=PublicKey.findProgramAddressSync([Buffer.from('vault'),configKey.toBuffer()],new PublicKey(pins.program))[0];
  const program=Buffer.alloc(36);program.writeUInt32LE(2);pd.toBuffer().copy(program,4);
  const elf=Buffer.from('7f454c4601020304','hex'),code=Buffer.alloc(45+elf.length);code.writeUInt32LE(3);code[12]=1;new PublicKey(pins.upgradeAuthority).toBuffer().copy(code,13);elf.copy(code,45);
  pins.elfBytes=elf.length;pins.elfSHA256=hash(elf);pins.programDataSHA256=hash(code);
  const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,v] of [[8,pins.bridge],[40,pins.genesis],[72,pins.remoteGenesis],[104,pins.remoteProgram],[136,pins.originMint]])new PublicKey(v).toBuffer().copy(config,o);
  for(let i=0;i<5;i++)new PublicKey(k()).toBuffer().copy(config,168+i*32);
  config[328]=6;config[329]=9;config[331]=3;config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2000000n,342);config.writeBigUInt64LE(4000000n,350);config.writeBigUInt64LE(1950000n,374);pins.policySHA256=hash(config.subarray(0,358));
  const mint=Buffer.alloc(82);mint.writeBigUInt64LE(2000000n,36);mint[44]=6;mint[45]=1;
  const escrow=Buffer.alloc(165);new PublicKey(pins.originMint).toBuffer().copy(escrow,0);vaultKey.toBuffer().copy(escrow,32);escrow.writeBigUInt64LE(1950000n,64);escrow[108]=1;
  const vault=Buffer.alloc(16);vault.write('SCVLT002');
  const calls=[],account=(b,owner,executable=false)=>({owner,executable,data:[b.toString('base64'),'base64']});let slot=50,assets=0;
  let mutate=()=>{};
  const fetcher=async(url,options)=>{
    const q=JSON.parse(options.body);calls.push(q);const isAsset=q.method==='getMultipleAccounts'&&q.params[0][0]===configKey.toBase58();if(isAsset)assets++;
    mutate(q,isAsset,assets);
    let result;if(q.method==='getGenesisHash')result=pins.genesis;
    else if(q.method==='getMultipleAccounts')result={context:{slot:++slot},value:isAsset?[account(config,pins.program),account(mint,TOKEN_2022),account(escrow,TOKEN_2022),account(vault,pins.program)]:[account(program,loader,true),account(code,loader),account(config,pins.program)]};
    else throw Error('Unexpected request');
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}));
  };
  return {pins,program,code,config,mint,escrow,vault,calls,fetcher,mutate:f=>{mutate=f;},options:{rpc:'http://127.0.0.1:20899',pins,expectedSupplyUnits:'2000000',expectedDecimals:6,minimumContextSlot:50}};
}
test('actual byte layouts reconcile immutable mint, PDA-owned escrow and recorded obligations with no mutating RPC',async()=>{
  const f=fixture(),r=await observeOriginAssets(f.options,f.fetcher);assert.equal(r.mintSupplyUnits,'2000000');assert.equal(r.originEscrowUnits,'1950000');assert.equal(r.originOutstandingUnits,'1950000');assert.equal(r.unallocatedEscrowSurplusUnits,'0');assert.equal(r.assetSnapshots,2);assert.equal(r.codeObservations,4);assert.equal(r.productionReady,false);assert.equal(r.completeGenesisBackingVerified,false);assert.equal(r.canBroadcast,false);
  assert(f.calls.every(q=>['getGenesisHash','getMultipleAccounts'].includes(q.method)));assert.equal(f.calls.filter(q=>q.method==='getMultipleAccounts').length,6);assert(!Object.hasOwn(r,'rpc'));assert(!Object.hasOwn(r,'data'));
});
test('a direct escrow surplus is reported separately rather than issued as additional obligations',async()=>{
  const f=fixture();f.escrow.writeBigUInt64LE(1960000n,64);const r=await observeOriginAssets(f.options,f.fetcher);assert.equal(r.unallocatedEscrowSurplusUnits,'10000');assert.equal(r.originOutstandingUnits,'1950000');
});
test('u64 balances above the JavaScript safe range remain exact decimal strings',async()=>{
  const f=fixture(),s=18446744073709551615n,n=9007199254740993n;f.mint.writeBigUInt64LE(s,36);f.escrow.writeBigUInt64LE(n+1n,64);f.config.writeBigUInt64LE(n,374);f.options.expectedSupplyUnits=String(s);const r=await observeOriginAssets(f.options,f.fetcher);assert.equal(r.mintSupplyUnits,String(s));assert.equal(r.originOutstandingUnits,String(n));assert.equal(r.unallocatedEscrowSurplusUnits,'1');
});
test('minting/freezing authority, wrong initialization or precision and altered expected supply reject',async()=>{
  for(const mode of ['mintAuthority','freezeAuthority','uninitialized','precision','supply']){const f=fixture();if(mode==='mintAuthority')f.mint.writeUInt32LE(1);if(mode==='freezeAuthority')f.mint.writeUInt32LE(1,46);if(mode==='uninitialized')f.mint[45]=0;if(mode==='precision')f.mint[44]=7;if(mode==='supply')f.options.expectedSupplyUnits='1999999';await assert.rejects(observeOriginAssets(f.options,f.fetcher),/mint supply/);}
});
test('wrong escrow mint/PDA authority, frozen or delegated/native/close-controlled escrow and old vault layout reject',async()=>{
  for(const offset of [0,32,108,72,109,121,129]){const f=fixture();f.escrow[offset]^=1;await assert.rejects(observeOriginAssets(f.options,f.fetcher),/escrow mint/);}
  const f=fixture();f.vault[7]^=1;await assert.rejects(observeOriginAssets(f.options,f.fetcher),/vault V2/);
});
test('underfunded escrow or escrow/obligations exceeding mint supply cannot pass',async()=>{
  for(const mode of ['underfunded','overSupply','overCounter']){const f=fixture();if(mode==='underfunded')f.escrow.writeBigUInt64LE(1949999n,64);if(mode==='overSupply')f.escrow.writeBigUInt64LE(2000001n,64);if(mode==='overCounter')f.config.writeBigUInt64LE(2000001n,374);await assert.rejects(observeOriginAssets(f.options,f.fetcher),/does not cover/);}
});
test('asset movement between reads or counter movement during final pin admission requires a new observation',async()=>{
  for(const mode of ['assets','lateCounter']){const f=fixture();let once=false;f.mutate((q,isAsset,n)=>{if(!once&&(mode==='assets'&&isAsset&&n===2||mode==='lateCounter'&&!isAsset&&q.method==='getMultipleAccounts'&&n===2)){once=true;f.config.writeBigUInt64LE(1949999n,374);}});await assert.rejects(observeOriginAssets(f.options,f.fetcher),/changed/);}
});
test('code changes after asset reads cannot inherit earlier pin admission',async()=>{
  const f=fixture();f.mutate((q,isAsset,n)=>{if(!isAsset&&q.method==='getMultipleAccounts'&&n===2)f.code[45]^=1;});await assert.rejects(observeOriginAssets(f.options,f.fetcher),/programme account/);
});
test('caller mutation cannot replace expected supply, precision or authority pins while awaiting RPC',async()=>{
  const f=fixture();f.mutate((q,isAsset,n)=>{if(isAsset&&n===1){f.mint.writeBigUInt64LE(1999999n,36);f.options.expectedSupplyUnits='1999999';}});await assert.rejects(observeOriginAssets(f.options,f.fetcher),/mint supply/);
});
test('public/canonical networks, native side, nonloopback endpoints and ambiguous supply reject before RPC',async()=>{
  for(const mode of ['public','canonical','native','external','query','number','overflow','leadingZero','zero','checkpoint']){const f=fixture();const o=f.options;if(mode==='public')f.pins.genesis=[...PUBLIC_GENESIS][0];if(mode==='canonical')f.pins.genesis='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';if(mode==='native')f.pins.side=1;if(mode==='external')o.rpc='https://example.com';if(mode==='query')o.rpc+='/?token=secret';if(mode==='number')o.expectedSupplyUnits=2000000;if(mode==='overflow')o.expectedSupplyUnits='18446744073709551616';if(mode==='leadingZero')o.expectedSupplyUnits='02000000';if(mode==='zero')o.expectedSupplyUnits='0';if(mode==='checkpoint')o.minimumContextSlot=-1;await assert.rejects(observeOriginAssets(o,f.fetcher));assert.equal(f.calls.length,0);}
});
test('unsupported token extensions, wrong owners, executable assets and malformed account data fail closed',async()=>{
  for(const mode of ['extensions','owner','executable','missing','base64','stateCount','stale','oversized','outage']){const f=fixture();const fetcher=async(...args)=>{const q=JSON.parse(args[1].body),isAsset=q.method==='getMultipleAccounts'&&q.params[0][0]!==f.pins.program;if(!isAsset)return f.fetcher(...args);if(mode==='outage')throw Error('Unavailable');if(mode==='oversized')return new Response(' '.repeat(32769));const w=await(await f.fetcher(...args)).json(),a=w.result.value[1];if(mode==='extensions')a.data[0]=Buffer.concat([f.mint,Buffer.alloc(84)]).toString('base64');if(mode==='owner')a.owner=f.pins.program;if(mode==='executable')a.executable=true;if(mode==='missing')w.result.value[1]=null;if(mode==='base64')a.data[0]+=' ';if(mode==='stateCount')w.result.value.pop();if(mode==='stale')w.result.context.slot=0;return new Response(JSON.stringify(w));};await assert.rejects(observeOriginAssets(f.options,fetcher));}
});
