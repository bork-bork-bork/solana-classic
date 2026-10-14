import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Keypair,PublicKey} from '@solana/web3.js';
import {observePinnedProgram} from './program-pins.mjs';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111',hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
  const k=()=>Keypair.generate().publicKey.toBase58();
  const pins={genesis:k(),remoteGenesis:k(),program:k(),remoteProgram:k(),bridge:k(),originMint:k(),upgradeAuthority:k(),side:0};
  const pd=PublicKey.findProgramAddressSync([new PublicKey(pins.program).toBuffer()],new PublicKey(LOADER))[0].toBase58();
  const program=Buffer.alloc(36);program.writeUInt32LE(2);new PublicKey(pd).toBuffer().copy(program,4);
  const elf=Buffer.from('7f454c4601020304','hex');pins.elfBytes=elf.length;pins.elfSHA256=hash(elf);
  const data=Buffer.alloc(45+elf.length+16);data.writeUInt32LE(3);data.writeBigUInt64LE(10n,4);data[12]=1;new PublicKey(pins.upgradeAuthority).toBuffer().copy(data,13);elf.copy(data,45);pins.programDataSHA256=hash(data);
  const config=Buffer.alloc(382);config.write('SCCFG001');for(const [o,v] of [[8,pins.bridge],[40,pins.genesis],[72,pins.remoteGenesis],[104,pins.remoteProgram],[136,pins.originMint]])new PublicKey(v).toBuffer().copy(config,o);
  for(let i=0;i<5;i++)new PublicKey(k()).toBuffer().copy(config,168+i*32);config[328]=6;config[329]=9;config[331]=3;config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2000000n,342);config.writeBigUInt64LE(4000000n,350);config.writeBigUInt64LE(1950000n,374);pins.policySHA256=hash(config.subarray(0,358));
  let snapshots=0;const calls=[];
  const value=(b,owner,executable)=>({owner,executable,data:[b.toString('base64'),'base64']});
  const fetcher=async(url,options)=>{
    const q=JSON.parse(options.body);calls.push(q);let result;
    if(q.method==='getGenesisHash')result=pins.genesis;
    else if(q.method==='getMultipleAccounts'){snapshots++;result={context:{slot:50+snapshots},value:[value(program,LOADER,true),value(data,LOADER,false),value(config,pins.program,false)]};}
    else throw Error('Unexpected mutating request');
    return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result}),{headers:{'content-type':'application/json'}});
  };
  return {pins,pd,program,data,config,fetcher,calls,options:{rpc:'http://127.0.0.1:20899',pins,minimumContextSlot:50},value};
}
test('code, authority, derived pointer and policy pin verify at two finalized contexts',async()=>{
  const f=fixture(),r=await observePinnedProgram(f.options,f.fetcher);assert.equal(r.state,'PINNED_PRIVATE_OBSERVATION');assert.equal(r.observations,2);assert.equal(r.firstContextSlot,51);assert.equal(r.contextSlot,52);assert.equal(r.outstandingUnits,'1950000');assert.equal(r.canSign,false);assert.equal(r.canBroadcast,false);assert.equal(r.productionReady,false);
  assert.deepEqual(f.calls.map(q=>q.method),['getGenesisHash','getMultipleAccounts','getMultipleAccounts','getGenesisHash']);assert.equal(f.calls[2].params[1].minContextSlot,51);assert(!Object.hasOwn(r,'data'));assert(!Object.hasOwn(r,'rpc'));
});
test('code replacement, upgrade authority or appended capacity tampering rejects',async()=>{
  for(const offset of [45,13,4]){const f=fixture();f.data[offset]^=1;await assert.rejects(observePinnedProgram(f.options,f.fetcher));}
  const f=fixture();f.data[f.data.length-1]=1;f.pins.programDataSHA256=hash(f.data);await assert.rejects(observePinnedProgram(f.options,f.fetcher),/code or unused/);
});
test('same code with a changed upgrade authority rejects even if account hash is supplied',async()=>{
  const f=fixture();new PublicKey(Keypair.generate().publicKey).toBuffer().copy(f.data,13);f.pins.programDataSHA256=hash(f.data);await assert.rejects(observePinnedProgram(f.options,f.fetcher),/upgrade authority/);
});
test('pause, epoch, committee, mint and limits cannot change behind the same address',async()=>{
  for(const offset of [340,341,332,168,136,342,350]){const f=fixture();f.config[offset]^=1;await assert.rejects(observePinnedProgram(f.options,f.fetcher),/policy differs/);}
});
test('invalid policy identities and duplicate committee cannot be blessed by a supplied digest',async()=>{
  const f=fixture();f.config.subarray(168,200).copy(f.config,200);f.pins.policySHA256=hash(f.config.subarray(0,358));await assert.rejects(observePinnedProgram(f.options,f.fetcher),/Invalid bridge/);
  const g=fixture();g.config[72]^=1;g.pins.policySHA256=hash(g.config.subarray(0,358));await assert.rejects(observePinnedProgram(g.options,g.fetcher),/identity differs/);
});
test('derived ProgramData pointer cannot be redirected to another code account',async()=>{
  const f=fixture();f.program[4]^=1;await assert.rejects(observePinnedProgram(f.options,f.fetcher),/pointer differs/);
});
test('bridge state counters can advance without changing the reviewed policy',async()=>{
  const f=fixture();let n=0;const fetcher=async(...args)=>{if(JSON.parse(args[1].body).method==='getMultipleAccounts'&&++n===2){f.config.writeBigUInt64LE(1950001n,374);f.config.writeBigUInt64LE(123n,366);}return f.fetcher(...args);};
  assert.equal((await observePinnedProgram(f.options,fetcher)).outstandingUnits,'1950001');
});
test('upgrade or pause between finalized reads rejects without cached success',async()=>{
  for(const target of ['data','config']){const f=fixture();let n=0;const fetcher=async(...args)=>{if(JSON.parse(args[1].body).method==='getMultipleAccounts'&&++n===2)f[target][target==='data'?45:341]^=1;return f.fetcher(...args);};await assert.rejects(observePinnedProgram(f.options,fetcher));}
});
test('wrong or changed genesis and regressing account contexts reject',async()=>{
  for(const mode of ['wrong','changed','stale']){
    const f=fixture();let genesi=0;const fetcher=async(...args)=>{const q=JSON.parse(args[1].body),r=await f.fetcher(...args),b=await r.json();if(q.method==='getGenesisHash'&&(mode==='wrong'||mode==='changed'&&++genesi===2))b.result=Keypair.generate().publicKey.toBase58();if(q.method==='getMultipleAccounts'&&mode==='stale')b.result.context.slot=49;return new Response(JSON.stringify(b));};await assert.rejects(observePinnedProgram(f.options,fetcher));
  }
});
test('public/soaking identity, nonloopback URL and missing pins reject before RPC',async()=>{
  const f=fixture();for(const options of [{...f.options,rpc:'https://api.mainnet-beta.solana.com'},{...f.options,rpc:'http://127.0.0.1:20899/?secret=1'},{...f.options,pins:{...f.pins,genesis:'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'}},{...f.options,pins:{...f.pins,programDataSHA256:null}},{...f.options,pins:{...f.pins,upgradeAuthority:undefined}}])await assert.rejects(observePinnedProgram(options,f.fetcher));assert.equal(f.calls.length,0);
});
test('owner, executable, account type, base64 and response bounds fail closed',async()=>{
  for(const mode of ['owner','executable','type','base64','missing','oversized']){
    const f=fixture();const fetcher=async(...args)=>{const r=await f.fetcher(...args),b=await r.json();if(JSON.parse(args[1].body).method==='getMultipleAccounts'){
      if(mode==='owner')b.result.value[1].owner=f.pins.program;if(mode==='executable')b.result.value[1].executable=true;if(mode==='type'){f.data.writeUInt32LE(1);f.pins.programDataSHA256=hash(f.data);b.result.value[1].data[0]=f.data.toString('base64');}if(mode==='base64')b.result.value[1].data[0]+=' ';if(mode==='missing')b.result.value[2]=null;if(mode==='oversized')return new Response(' '.repeat(2*1024*1024+1));
    }return new Response(JSON.stringify(b));};await assert.rejects(observePinnedProgram(f.options,fetcher));
  }
});
test('a caller cannot mutate expected pins while the observer is awaiting RPC',async()=>{
  const f=fixture();let n=0;const fetcher=async(...args)=>{if(JSON.parse(args[1].body).method==='getMultipleAccounts'&&++n===1){f.data[45]^=1;f.pins.programDataSHA256=hash(f.data);f.pins.elfSHA256=hash(f.data.subarray(45,45+f.pins.elfBytes));}return f.fetcher(...args);};await assert.rejects(observePinnedProgram(f.options,fetcher));
});
