import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {factsMatch,reviewAccounts,run,API,TOKEN,ATA} from './network-facts-review.mjs';
const freeze=JSON.parse(readFileSync(new URL('../../evidence/candidate-freeze.json',import.meta.url)));
const loader='BPFLoaderUpgradeab1e11111111111111111111111',loader2='BPFLoader2111111111111111111111111111111111';
const facts={expectedGenesisHash:freeze.genesis,mode:'remote',denomination:'TEST',operatorCount:1,hasMonetaryValue:false,tokenProgram:TOKEN,associatedTokenProgram:ATA,resetPolicy:'No automatic reset. Any deliberate reset will be disclosed; test assets have no monetary value.'};
function fixture(){
  const elf=Buffer.from('7f454c46020101','hex'),pd=Buffer.alloc(45+elf.length+8),token=Buffer.alloc(36);pd.writeUInt32LE(3);elf.copy(pd,45);token.writeUInt32LE(2);PublicKey.findProgramAddressSync([new PublicKey(TOKEN).toBuffer()],new PublicKey(loader))[0].toBuffer().copy(token,4);
  const account=(bytes,owner,executable)=>({owner,executable,data:[bytes.toString('base64'),'base64']});
  return {snapshot:{context:{slot:50},value:[account(token,loader,true),account(elf,loader2,true),account(pd,loader,false)]},expected:{bytes:elf.length,sha256:createHash('sha256').update(elf).digest('hex')}};
}
test('identity, valueless denomination, operator and reset facts must all match',()=>{
  assert(factsMatch(facts,freeze.genesis));for(const [k,v] of Object.entries({expectedGenesisHash:'wrong',mode:'local',denomination:'SOC',operatorCount:2,hasMonetaryValue:true,tokenProgram:ATA,associatedTokenProgram:TOKEN,resetPolicy:'Always reset'}))assert.equal(factsMatch({...facts,[k]:v},freeze.genesis),false,k);
  for(const genesis of ['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'])assert.equal(factsMatch({...facts,expectedGenesisHash:genesis},genesis),false);
});
test('finalized executable layout and exact synthetic code are inspected',()=>{const f=fixture(),r=reviewAccounts(f.snapshot,50,f.expected);assert.equal(r.tokenElfSHA256,f.expected.sha256);assert.equal(r.tokenUpgradeAuthority,null);assert(r.bothExecutable);});
test('old or missing account snapshot rejects',()=>{const f=fixture();assert.throws(()=>reviewAccounts(f.snapshot,51,f.expected));assert.throws(()=>reviewAccounts({...f.snapshot,value:f.snapshot.value.slice(0,2)},0,f.expected));assert.throws(()=>reviewAccounts({...f.snapshot,context:{slot:NaN}},0,f.expected));});
test('wrong loader, executable flag, encoding and pointer reject',()=>{
  for(const change of [a=>a.owner=loader2,a=>a.executable=false,a=>a.data[1]='base58',a=>a.data[0]=Buffer.alloc(36).toString('base64')]){const f=fixture();change(f.snapshot.value[0]);assert.throws(()=>reviewAccounts(f.snapshot,50,f.expected));}
});
test('code mutation, wrong official digest and nonzero unused capacity reject',()=>{
  for(const position of [45,59]){const f=fixture();const b=Buffer.from(f.snapshot.value[2].data[0],'base64');b[position===59?b.length-1:position]^=1;f.snapshot.value[2].data[0]=b.toString('base64');assert.throws(()=>reviewAccounts(f.snapshot,50,f.expected));}
  const f=fixture();assert.throws(()=>reviewAccounts(f.snapshot,50,{...f.expected,sha256:'0'.repeat(64)}));
});
test('wrong runtime halts before RPC, no alternate caller-selected host',async()=>{const seen=[];const r=await run(async(url,o)=>{seen.push({url,method:o.method});return new Response(JSON.stringify({...freeze.runtime,validatorBootId:'changed'}));});assert.equal(r.passed,false);assert.deepEqual(seen,[{url:API+'/api/runtime',method:'GET'}]);});
test('wrong RPC envelope fails before programme reads',async()=>{const seen=[];const r=await run(async(url,o)=>{seen.push(url);return new Response(JSON.stringify(url.endsWith('/api/runtime')?freeze.runtime:{jsonrpc:'2.0',id:'wrong',result:freeze.genesis}));});assert.equal(r.passed,false);assert.equal(seen.length,2);assert.match(r.failure,/RPC rejected/);});
test('oversized remote response rejected',async()=>{const r=await run(async()=>new Response(' '.repeat(2097153)));assert.equal(r.passed,false);assert.match(r.failure,/exceeds bound/);});
