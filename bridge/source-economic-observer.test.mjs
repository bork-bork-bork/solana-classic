import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {observeSelectedSourceTransaction as observe} from './source-economic-observer.mjs';
import {sourceEconomicFixture} from './test-fixtures/source-economic.mjs';
function fixture(side=0){
 const f=sourceEconomicFixture(side),s=f.codeFixture,calls=[];let slot=100;
 const options=()=>{const {raw,...selected}=f.options();return {rpc:'http://127.0.0.1:21899',...selected};};
 const reply=q=>{
  if(q.method==='getTransaction'){assert.equal(q.params[0],f.options().signature);return f.options().raw;}
  const account=(bytes,owner,executable=false)=>({owner,executable,lamports:1000,data:[bytes.toString('base64'),'base64']});
  const result=q.method==='getGenesisHash'?s.pins.genesis:{context:{slot:++slot},value:[account(s.pointer,'BPFLoaderUpgradeab1e11111111111111111111111',true),account(s.data,'BPFLoaderUpgradeab1e11111111111111111111111'),account(s.config,s.pins.program)]};
  return JSON.stringify({jsonrpc:'2.0',id:1,result});
 };
 const fetcher=async(url,init)=>{const q=JSON.parse(init.body);calls.push(q);return new Response(reply(q),{headers:{'Content-Type':'application/json'}});};
 return {f,s,calls,options,reply,fetcher};
}
test('both selected source directions perform only nine bounded reads with current code brackets',async()=>{
 for(const side of [0,1]){const f=fixture(side),r=await observe(f.options(),f.fetcher);assert.equal(r.readOnlyRequests,9);assert(r.selectedCurrentCodeBracketsObserved&&r.selectedEconomicMetadataMatched);assert.equal(r.rpcObservationExecuted,true);assert.equal(r.chainInclusionVerified,false);assert.equal(r.sourceEconomicMovementsIndependentlyVerified,false);assert.equal(r.productionReady,false);const q=f.calls.find(q=>q.method==='getTransaction');assert.deepEqual(q.params,[f.f.options().signature,{commitment:'finalized',encoding:'json',maxSupportedTransactionVersion:0}]);assert(f.calls.every(q=>['getGenesisHash','getMultipleAccounts','getTransaction'].includes(q.method)));}
});
test('wrong endpoints, public or changed selected pins, missing event and unsafe budgets refuse before RPC',async()=>{
 const f=fixture();for(const patch of [{rpc:'https://example.com:443'},{rpc:'http://localhost:21899'},{rpc:'http://secret@127.0.0.1:21899'},{rpc:'http://127.0.0.1:21899/?key=value'},{timeoutMs:99},{timeoutMs:30001},{sourceEvent:f.f.event.sender},{signature:'bad'},{pins:{...f.s.pins,genesis:'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'}},{extra:true}])await assert.rejects(observe({...f.options(),...patch},f.fetcher));assert.equal(f.calls.length,0);
});
test('pruned, failed, tampered and oversized transaction history never returns a settlement observation',async()=>{
 for(const mode of ['null','failed','tamper','declared','stream']){const f=fixture();const fetcher=async(url,init)=>{const q=JSON.parse(init.body);if(q.method!=='getTransaction')return f.fetcher(url,init);if(mode==='null')return new Response('{"jsonrpc":"2.0","id":1,"result":null}',{headers:{'Content-Type':'application/json'}});if(mode==='failed')f.f.payload.result.meta.err={Custom:1};if(mode==='tamper')f.f.payload.result.meta.postBalances[0]--;return new Response(mode==='stream'?' '.repeat(65537):f.f.options().raw,{headers:{'Content-Type':'application/json',...(mode==='declared'?{'Content-Length':'65537'}:{})}});};await assert.rejects(observe(f.options(),fetcher));}
});
test('late code, authority, genesis, policy or current counter changes refuse an otherwise valid source transaction',async()=>{
 for(const mode of ['code','authority','genesis','policy','counter']){const f=fixture();let reads=0,genesi=0;const fetcher=async(url,init)=>{const q=JSON.parse(init.body);if(q.method==='getMultipleAccounts'&&++reads===3){if(mode==='code')f.s.data[45]^=1;if(mode==='authority')f.s.data[13]^=1;if(mode==='policy')f.s.config[342]^=1;if(mode==='counter')f.s.config.writeBigUInt64LE(1n,374);}if(q.method==='getGenesisHash'&&++genesi===3&&mode==='genesis')return new Response('{"jsonrpc":"2.0","id":1,"result":"11111111111111111111111111111111"}',{headers:{'Content-Type':'application/json'}});return f.fetcher(url,init);};await assert.rejects(observe(f.options(),fetcher));}
});
test('caller mutation after the first asynchronous read cannot replace captured snapshot or selected pins',async()=>{
 const f=fixture(),o=f.options();let changed=false;const fetcher=async(url,init)=>{if(!changed){changed=true;o.snapshot.accounts[2].lamports='1';o.pins={...o.pins,elfSHA256:'f'.repeat(64)};o.signature='2'.repeat(88);}return f.fetcher(url,init);};const r=await observe(o,fetcher);assert(r.selectedEconomicMetadataMatched);
});
test('one deadline covers a transport ignoring cancellation and synchronous late responses',async()=>{
 for(const sync of [false,true]){const f=fixture();let calls=0;const began=performance.now();await assert.rejects(observe({...f.options(),timeoutMs:100},async(url,init)=>{calls++;if(!sync)return new Promise(()=>{});const start=performance.now();while(performance.now()-start<120){}return f.fetcher(url,init);}),/single deadline/);assert.equal(calls,1);assert(performance.now()-began<1000);}
});
async function serve(t,handler){const s=createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(async()=>{s.closeAllConnections();await new Promise(resolve=>s.close(resolve));});return `http://127.0.0.1:${s.address().port}`;}
test('actual loopback HTTP preserves selected transaction balances and returns only read methods',async t=>{
 const f=fixture(1);let requests=0;const rpc=await serve(t,async(req,res)=>{requests++;let body='';for await(const c of req)body+=c;res.writeHead(200,{'Content-Type':'application/json'}).end(f.reply(JSON.parse(body)));});const r=await observe({...f.options(),rpc});assert.equal(requests,9);assert(r.selectedEconomicMetadataMatched);assert.equal(r.backingVerified,false);
});
test('actual redirected or slowly streaming HTTP cannot escape the endpoint and deadline',async t=>{
 const f=fixture();let reached=0;const target=await serve(t,(req,res)=>{reached++;req.resume();res.end('{}');});const redirect=await serve(t,(req,res)=>{req.resume();res.writeHead(307,{Location:target}).end();});await assert.rejects(observe({...f.options(),rpc:redirect}));assert.equal(reached,0);
 let interval,closed;const ended=new Promise(resolve=>{closed=resolve;});const stream=await serve(t,(req,res)=>{req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.write(' ');interval=setInterval(()=>res.write(' '),20);res.once('close',()=>{clearInterval(interval);closed();});});
 await assert.rejects(observe({...f.options(),rpc:stream,timeoutMs:150}),/single deadline/);let timer;try{await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Connection stayed open')),1000);})]);}finally{clearTimeout(timer);clearInterval(interval);}
});
