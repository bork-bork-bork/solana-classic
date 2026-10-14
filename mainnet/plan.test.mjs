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
