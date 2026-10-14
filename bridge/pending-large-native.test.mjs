import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fixture } from './test-fixtures/pending.mjs';
import { preparePendingClaim,takeSubmissionAttempt,reconcilePendingClaim } from './pending-claim.mjs';
const wire=d=>JSON.stringify(d,(_k,v)=>typeof v==='bigint'?'RAW_U64_'+v.toString():v).replace(/"RAW_U64_([0-9]+)"/g,'$1');
function largeMetadata(f,{wrongDelta=false,wrongCount=false,badRaw=null}={}){
  return async(url,options)=>{
    const r=await f.fetcher(url,options),q=JSON.parse(options.body);if(q.method!=='getTransaction')return r;
    const d=JSON.parse(await r.text()),keys=f.tx.compileMessage().accountKeys;
    const recipient=keys.findIndex(k=>k.toBase58()===f.e.recipient),vault=keys.findIndex(k=>k.equals(f.ix.keys[2].pubkey));
    const pre=keys.map(()=>500_000_000_000_000_000n),post=[...pre];pre[recipient]=600_000_000_000_000_000n;pre[vault]=900_000_000_000_000_000n;
    post[recipient]=pre[recipient]+1_000_000_000n+(wrongDelta?1n:0n);post[vault]=pre[vault]-1_000_000_000n;
    if(wrongCount){pre.push(1n);post.push(1n);}d.result.meta.preBalances=pre;d.result.meta.postBalances=post;
    let raw=wire(d);if(badRaw)raw=raw.replace('600000000000000000',badRaw);
    return {ok:true,text:async()=>raw};
  };
}
test('same signed native claim reconciles exact large balances without rounding',async t=>{
  const f=fixture(t),p=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,p.id,f.fetcher);f.mode('finalized');
  const r=await reconcilePendingClaim(f.directory,p.id,largeMetadata(f));assert.equal(r.state,'FINALIZED');assert.equal(f.record(p.id).attempts,1);
});
test('one native base-unit discrepancy above Number precision cannot finalize',async t=>{
  const f=fixture(t),p=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,p.id,f.fetcher);f.mode('finalized');
  await assert.rejects(reconcilePendingClaim(f.directory,p.id,largeMetadata(f,{wrongDelta:true})),/movement differs/);assert.equal(f.record(p.id).state,'SUBMISSION_ATTEMPTED');assert.equal(f.record(p.id).attempts,1);
});
test('extra economic accounts cannot alter the signed transaction reconciliation',async t=>{
  const f=fixture(t),p=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,p.id,f.fetcher);f.mode('finalized');
  await assert.rejects(reconcilePendingClaim(f.directory,p.id,largeMetadata(f,{wrongCount:true})),/account count/);assert.equal(f.record(p.id).state,'SUBMISSION_ATTEMPTED');
});
test('noncanonical or overflowing native wire values retain the pending record',async t=>{
  const f=fixture(t),p=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,p.id,f.fetcher);f.mode('finalized');
  for(const badRaw of ['6e17','18446744073709551616','"600000000000000000"'])await assert.rejects(reconcilePendingClaim(f.directory,p.id,largeMetadata(f,{badRaw})));
  assert.equal(f.record(p.id).state,'SUBMISSION_ATTEMPTED');assert.equal(f.record(p.id).attempts,1);
});
test('actual loopback HTTP carries large raw integers through exact journal reconciliation',async t=>{
  const f=fixture(t),response=largeMetadata(f);let servedLarge=false;
  const server=createServer(async(req,res)=>{
    try{
      let body='';for await(const chunk of req){body+=chunk;assert(body.length<=16384);}
      const r=await response('http://127.0.0.1:9900',{body});const raw=await r.text();
      if(JSON.parse(body).method==='getTransaction'){assert(raw.includes('600000000000000000'));servedLarge=true;}
      res.writeHead(200,{'Content-Type':'application/json'});res.end(raw);
    }catch{res.writeHead(500);res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  f.args.rpc='http://127.0.0.1:'+server.address().port+'/';
  const p=preparePendingClaim(f.args);await takeSubmissionAttempt(f.directory,p.id,f.fetcher);f.mode('finalized');
  const r=await reconcilePendingClaim(f.directory,p.id);assert.equal(r.state,'FINALIZED');assert(servedLarge);assert.equal(f.record(p.id).attempts,1);
});
