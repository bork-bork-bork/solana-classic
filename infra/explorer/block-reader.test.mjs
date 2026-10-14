import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GENESIS,readTransactions,readAddressTransactions,createBlockReader,loopbackRpc} from './block-reader.mjs';
const sig=n=>'1'.repeat(80)+String(n).replaceAll('0','A');
const fixture=(genesis=GENESIS)=>async(method,params)=>{
  if(method==='getGenesisHash')return genesis;
  if(method==='getSlot')return 500;if(method==='getFirstAvailableBlock')return 400;
  if(method==='getBlocks')return[498,499,500].filter(slot=>slot<=params[1]);
  if(method==='getSignaturesForAddress')return[{signature:sig(49901),slot:499,err:null,blockTime:1700000000}];
  if(method==='getBlock')return{blockTime:1700000000,transactions:Array.from({length:20},(_,index)=>({transaction:{signatures:[sig(params[0]*100+index)],message:{instructions:[{programId:index%2?'11111111111111111111111111111111':'Vote111111111111111111111111111111111111111'}]}},meta:{err:index===2?{error:'fixture'}:null,fee:5000}}))};
  throw Error('Unexpected fixture method');
};
test('Read chain-wide finalized votes and user transactions with accurate failure status',async()=>{
  const result=await readTransactions('',fixture());assert.equal(result.entries.length,25);assert.ok(result.entries.some(e=>e.kind==='Vote'));assert.ok(result.entries.some(e=>e.kind==='Transfer / System'));assert.ok(result.entries.some(e=>e.status==='Failed'));assert.equal(result.nextCursor,'499:5');
  const older=await readTransactions(result.nextCursor,fixture());assert.equal(older.entries[0].signature,sig(49905));assert.ok(!result.entries.some(e=>e.signature===older.entries[0].signature));
});
test('Address history keeps canonical chain binding and validates address cursors',async()=>{
  const result=await readAddressTransactions('1'.repeat(32),undefined,fixture());assert.equal(result.entries.length,1);assert.equal(result.entries[0].signature,sig(49901));
  await assert.rejects(readAddressTransactions('bad',undefined,fixture()));await assert.rejects(readAddressTransactions('1'.repeat(32),'bad',fixture()));await assert.rejects(readAddressTransactions('1'.repeat(32),undefined,fixture('wrong')));
});
test('Reject wrong genesis, invalid cursors and attempts to submit transactions',async()=>{
  await assert.rejects(readTransactions('',fixture('wrong')));await assert.rejects(readTransactions('999:0',fixture()));await assert.rejects(readTransactions('http://evil.example',fixture()));await assert.rejects(loopbackRpc('sendTransaction'));
});
test('Private block endpoint rejects mutation and arbitrary routes before RPC',async()=>{
  let calls=0;const server=createBlockReader(async()=>{calls++;throw Error('Should not probe');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  try{assert.equal((await fetch(url+'/transactions',{method:'POST'})).status,405);assert.equal((await fetch(url+'/transactions?url=http://evil.example')).status,404);assert.equal((await fetch(url+'/transactions?cursor=bad')).status,400);assert.equal(calls,0);}finally{await new Promise(resolve=>server.close(resolve));}
});
