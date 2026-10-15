import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import { planGenesis } from './plan.mjs';
const key=i=>new PublicKey(Uint8Array.from({length:32},(_,j)=>(i+j)%256)).toBase58();
function input(){return {schemaVersion:1,environment:'isolated-rehearsal',runtimeSource:'f516a8927c76c07f0ebc54ca7a4ce8b2046eee86',inflation:'none',nativeDecimals:9,originDecimals:6,
  originMint:key(1),reserveAddress:key(2),originSupplyUnits:'1000000000000000',prelockedOriginUnits:'1000000000',systemAccountBudgetUnits:'1000000000',
  validators:[0,1,2].map(i=>({operator:'rehearsal-operator-'+i,identity:key(10+i*3),vote:key(11+i*3),stake:key(12+i*3),balanceUnits:'1000000000',stakeUnits:'100000000000',rpcPort:9900+i*10}))};}
test('draft preserves exact supply, backed allocations and reserve, with execution disabled',()=>{
  const p=planGenesis(input());assert.equal(p.deploymentEnabled,false);assert.equal(p.totalNativeUnits,'1000000000000000000');
  assert.equal(BigInt(p.reserve.nativeUnits)+BigInt(p.bootstrapAndSystemUnits),BigInt(p.totalNativeUnits));
  assert.ok(p.requiredBeforeGenesis.some(x=>x.includes('bootstrap accounting')));
});
test('unbacked bootstrap funding is rejected',()=>{const c=input();c.prelockedOriginUnits='1';assert.throws(()=>planGenesis(c),/Unbacked/);});
test('declared reserve protection must also be backed',()=>{
  const c=input();c.protectedReserveNativeUnits='1000000000000';assert.throws(()=>planGenesis(c),/Unbacked/);
  c.protectedReserveNativeUnits='946560';const p=planGenesis(c);assert.equal(p.declaredProtectedReserveNativeUnits,'946560');assert(p.requiredBeforeGenesis.some(v=>v.includes('bootstrap.mjs')));
});
test('production, inflation and precision mismatches fail closed',()=>{
  for(const [field,value] of [['environment','mainnet'],['inflation','full'],['originDecimals',10],['nativeDecimals',6],['runtimeSource','bad']]){
    const c=input();c[field]=value;assert.throws(()=>planGenesis(c));
  }
});
test('duplicate accounts, operator labels and port collisions are rejected',()=>{
  for(const mutate of [c=>c.validators[1].identity=c.validators[0].identity,c=>c.validators[1].operator=c.validators[0].operator,c=>c.validators[1].rpcPort=c.validators[0].rpcPort+1]){
    const c=input();mutate(c);assert.throws(()=>planGenesis(c));
  }
});
test('integer notation and native overflow are rejected',()=>{
  for(const value of ['1e9','1.1','01','-1',100]){const c=input();c.originSupplyUnits=value;assert.throws(()=>planGenesis(c));}
  const c=input();c.originSupplyUnits='18446744073709551615';assert.throws(()=>planGenesis(c),/overflows/);
});
test('current experimental genesis cannot become the mainnet ledger',()=>{
  const c=input();c.expectedGenesis='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';assert.throws(()=>planGenesis(c),/must not be reused/);
});
test('budget output no longer exposes runnable validator arguments or bypass flags',()=>{
  const p=planGenesis(input());assert.equal(p.schemaVersion,2);assert.equal('validatorArgumentDrafts' in p,false);
  assert.equal(p.execution.enabled,false);assert.equal(p.execution.commandGenerationEnabled,false);
  assert.equal(p.execution.preparationEntryPoint,'mainnet/prepare-consensus.py');assert.equal(p.execution.rehearsalEntryPoint,'mainnet/consensus.py');
  assert.equal(p.execution.productionActivationEnabled,false);assert.equal(p.execution.independentOperatorsVerified,false);
  assert.equal(JSON.stringify(p).includes('--no-port-check'),false);assert.equal(p.expectedGenesis,null);
});
test('known Solana mainnet, devnet and testnet genesi are not fresh rehearsal inputs',()=>{
  for(const genesis of ['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']){
    const c=input();c.expectedGenesis=genesis;assert.throws(()=>planGenesis(c),/must not be reused/);
  }
});
test('zero programme identity is invalid for every planner key role',()=>{
  for(const role of ['originMint','reserveAddress','identity','vote','stake']){
    const c=input();if(['originMint','reserveAddress'].includes(role))c[role]='11111111111111111111111111111111';else c.validators[0][role]='11111111111111111111111111111111';
    assert.throws(()=>planGenesis(c),/canonical nonzero/);
  }
});
test('mint and native reserve cannot silently share one address',()=>{
  const c=input();c.reserveAddress=c.originMint;assert.throws(()=>planGenesis(c),/must be distinct/);
});
test('whitespace does not make duplicate declared operators independent',()=>{
  const c=input();c.validators[1].operator=' '+c.validators[0].operator+' ';assert.throws(()=>planGenesis(c),/Distinct declared validator labels/);
  const d=input();d.validators[0].operator=' '+d.validators[0].operator+' ';const p=planGenesis(d);assert.equal(p.validators[0].operator,d.validators[0].operator.trim());assert.equal(p.execution.independentOperatorsVerified,false);
});
test('provided genesis must be a canonical identifier and never enables execution',()=>{
  for(const value of [null,'','bad','11111111111111111111111111111111',42]){const c=input();c.expectedGenesis=value;assert.throws(()=>planGenesis(c),/canonical nonzero/);}
  const c=input();c.expectedGenesis=key(200);const p=planGenesis(c);assert.equal(p.expectedGenesis,c.expectedGenesis);assert.equal(p.deploymentEnabled,false);assert.equal(p.execution.enabled,false);
});
test('planner scope matches the guarded three-validator rehearsal package',()=>{
  for(const count of [0,1,2,4]){
    const c=input();c.validators=Array.from({length:count},(_,i)=>({...c.validators[i%3]}));assert.throws(()=>planGenesis(c),/Exactly three/);
  }
});
