import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNativeTransactionRPC } from './lossless-native-rpc.mjs';
const body=(pre,post)=>`{"jsonrpc":"2.0","id":1,"result":{"slot":45,"meta":{"err":null,"preBalances":[${pre}],"postBalances":[${post}]}}}`;
test('native JSON digits retain exact u64 values beyond Number precision',()=>{
  const r=parseNativeTransactionRPC(body('9007199254740993,18446744073709551615,0','9007199254740994,18446744073709551614,1'));
  assert.deepEqual(r.result.meta.preBalances,[9007199254740993n,18446744073709551615n,0n]);assert.equal(r.result.meta.postBalances[0]-r.result.meta.preBalances[0],1n);assert.equal(r.result.slot,45);assert.equal(r.id,1);
});
test('negative, overflowing, fractional, exponent, string and null balances reject',()=>{
  for(const n of ['-1','18446744073709551616','0.5','1e3','"1000"','null'])assert.throws(()=>parseNativeTransactionRPC(body(n,'0')));
});
test('missing, empty, oversized or mismatched balance arrays reject',()=>{
  assert.throws(()=>parseNativeTransactionRPC(body('','')));assert.throws(()=>parseNativeTransactionRPC(body('1,2','1')));assert.throws(()=>parseNativeTransactionRPC(body(Array(257).fill('0').join(','),'0')));
  assert.throws(()=>parseNativeTransactionRPC('{"result":{"meta":{"err":null}}}'));assert.throws(()=>parseNativeTransactionRPC(' '.repeat(65537)));
});
test('pruned/null transaction and other RPC scalar fields keep their existing shape',()=>{
  assert.deepEqual(parseNativeTransactionRPC('{"jsonrpc":"2.0","id":1,"result":null}'),{jsonrpc:'2.0',id:1,result:null});
  const r=parseNativeTransactionRPC(body('1','2'));assert.equal(typeof r.result.slot,'number');assert.equal(r.result.meta.preBalances[0],1n);
});
test('balance source lookup follows actual arrays despite unrelated numbers',()=>{
  const raw=body('9007199254740993','9007199254740994').replace('"slot":45','"unrelated":[5,6,7],"slot":45');
  const r=parseNativeTransactionRPC(raw);assert.deepEqual(r.result.unrelated,[5,6,7]);assert.equal(r.result.meta.postBalances[0],9007199254740994n);
});
