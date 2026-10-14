// Read-only policy/code pin checks on new private copies. Zero transactions.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PublicKey} from '@solana/web3.js';
import {observePinnedProgram} from './program-pins.mjs';
import {PUBLIC_GENESIS} from './sdk.mjs';
const root='/data/bridge-program-pins-v1',source='/data/bridge-v2-redemption-pending-v1';
const manifest=JSON.parse(fs.readFileSync(source+'/private-input.json'));
const earlier=JSON.parse(fs.readFileSync(source+'/public-result.json'));
const baseline=JSON.parse(fs.readFileSync(source+'/baseline-proof-public.json'));
const checkpoint=JSON.parse(fs.readFileSync('/data/bridge-cold-restore-v2/checkpoint-private.json'));
assert.equal(manifest.scope,'isolated-synthetic-bootstrap-v2');assert.equal(earlier.state,'passed');assert(earlier.processes.allStopped);assert.equal(earlier.operation.state,'FINALIZED');assert.deepEqual(earlier.genesi,manifest.genesi);
assert(manifest.genesi.every(g=>!PUBLIC_GENESIS.has(g)&&g!=='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
const hash=b=>createHash('sha256').update(b).digest('hex'),pub=n=>new PublicKey(Uint8Array.from(manifest.keys[n].slice(32))).toBase58();
const elf=fs.readFileSync(root+'/bridge.so');assert.equal(hash(elf),'556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53');
const checks=[],observations=[];
for(let i=0;i<2;i++){
  const p=new PublicKey(manifest.programs[i]),pd=PublicKey.findProgramAddressSync([p.toBuffer()],new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111'))[0].toBase58();
  const expectedData=checkpoint[i].accounts.find(a=>a.address===pd);assert(expectedData&&expectedData.owner==='BPFLoaderUpgradeab1e11111111111111111111111'&&!expectedData.executable);
  // Policy comes from the reviewed synthetic fixture configuration, not a
  // fresh endpoint response. Variable day/settled/outstanding fields excluded.
  const config=Buffer.alloc(358);config.write('SCCFG001');for(const [o,v] of [[8,manifest.bridge],[40,manifest.genesi[i]],[72,manifest.genesi[1-i]],[104,manifest.programs[1-i]],[136,baseline.mint]])new PublicKey(v).toBuffer().copy(config,o);
  for(let j=0;j<5;j++)new PublicKey(pub('committee'+j)).toBuffer().copy(config,168+j*32);
  config[328]=6;config[329]=9;config[330]=i;config[331]=3;config.writeBigUInt64LE(1n,332);config.writeBigUInt64LE(2000000n,342);config.writeBigUInt64LE(4000000n,350);
  const pins={genesis:manifest.genesi[i],remoteGenesis:manifest.genesi[1-i],program:manifest.programs[i],remoteProgram:manifest.programs[1-i],bridge:manifest.bridge,originMint:baseline.mint,side:i,upgradeAuthority:pub('payer'),elfSHA256:hash(elf),elfBytes:elf.length,programDataSHA256:expectedData.dataSHA256,policySHA256:hash(config)};
  const options={rpc:'http://127.0.0.1:'+manifest.ports[i],pins,minimumContextSlot:checkpoint[i].contextSlot};
  const observed=await observePinnedProgram(options);assert.equal(observed.outstandingUnits,'1950000');assert(!observed.newLocksPaused&&!observed.settlementPaused);observations.push(observed);checks.push('Side'+i+' deployed code, authority, loader pointer and reviewed fixture policy match at two finalized contexts');
  for(const change of [{elfSHA256:'0'.repeat(64)},{upgradeAuthority:pub('committee0')},{policySHA256:'0'.repeat(64)}])await assert.rejects(observePinnedProgram({...options,pins:{...pins,...change}}));
  checks.push('Side'+i+' wrong artifact, authority and policy pins reject against actual private accounts');
}
const result={schemaVersion:1,state:'passed',scope:'Actual private copied Agave programme/policy observation with reviewed synthetic fixture pins; no signing, simulations or broadcasts',completedAt:new Date().toISOString(),checks,observations,broadcasts:0,simulations:0,productionReady:false,canonicalNetworkChanged:false,operatorIndependenceVerified:false,globalBacking:earlier.globalBacking,pinSource:{programmeArtifactSHA256:hash(elf),coldCheckpointSHA256:hash(fs.readFileSync('/data/bridge-cold-restore-v2/checkpoint-private.json')),policy:'Derived from the reviewed synthetic bootstrap fixture, not learnt from fresh RPC'}};
fs.writeFileSync(root+'/public-result.json',JSON.stringify(result,null,2));
