import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runtimeMatches,probes,accepts,run} from './gateway-review.mjs';
const freeze=JSON.parse(readFileSync(new URL('../../evidence/candidate-freeze.json',import.meta.url)));
function fake(mode='pass'){
  const seen=[];const fetcher=async(url,options)=>{
    seen.push({url,options});let body,status=200,headers={};const path=new URL(url).pathname;
    if(path==='/api/runtime')body=mode==='wrongRuntime'?{...freeze.runtime,validatorBootId:'changed'}:freeze.runtime;
    else if(path==='/api/network'&&seen.length===2)body={mode:'remote',hasMonetaryValue:false,operatorCount:1,expectedGenesisHash:freeze.genesis};
    else {
      const p=probes()[seen.length-3];status=p.expected;body=p.code?{error:{code:p.code}}:p.result?{jsonrpc:'2.0',id:'protocol-review',result:p.result}:{};
      if(p.allowOrigin)headers['access-control-allow-origin']=p.allowOrigin;
      if(p.preflight)Object.assign(headers,{'access-control-allow-headers':'Content-Type,solana-client','access-control-allow-methods':'GET,POST,OPTIONS'});
      if(mode==='unexpectedSuccess'&&p.body?.method==='requestAirdrop'){status=200;body={result:'bad'};}
      if(mode==='oversize')return new Response(' '.repeat(262145));
    }
    return new Response(status===204?null:JSON.stringify(body),{status,headers});
  };return {fetcher,seen};
}
test('every original runtime identity is mandatory',()=>{assert(runtimeMatches(freeze.runtime));for(const k of ['genesis','sourceCommit','coreSha256','apiBootId','validatorBootId','deploymentId','tokenProgramSha256'])assert.equal(runtimeMatches({...freeze.runtime,[k]:'changed'}),false);});
test('fixed plan has no valid grants,assets,usable transactions or actual node-control method',()=>{
  const p=probes();assert.equal(p.length,25);assert(p.every(x=>['/api/rpc','/api/network','/api/faucet','/api/assets'].includes(x.path)));
  for(const x of p){if(['/api/assets','/api/faucet'].includes(x.path))assert.equal(x.method,'OPTIONS');assert(!['validatorExit','setLogFilter'].includes(x.body?.method));if(x.body?.method==='requestAirdrop')assert.deepEqual(x.body.params,[]);if(x.body?.method==='sendTransaction')assert.equal(Buffer.from(x.body.params[0],'base64').length,1233);}
});
test('CORS requires exact origin,method/header lists and no credentials',()=>{
  const p=probes().find(x=>x.preflight),r={status:204,body:{},headers:{'access-control-allow-origin':p.allowOrigin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type,solana-client'}};assert(accepts(p,r));
  for(const [k,v] of [['access-control-allow-origin','*'],['access-control-allow-methods','GET, POST, OPTIONS, PUT'],['access-control-allow-headers','*'],['access-control-allow-credentials','true']])assert.equal(accepts(p,{...r,headers:{...r.headers,[k]:v}}),false);
});
test('status,error code,genesis and unknown-origin allowance cannot be substituted',()=>{
  const p=probes().find(x=>x.code);assert(accepts(p,{status:p.expected,body:{error:{code:p.code}},headers:{}}));assert.equal(accepts(p,{status:200,body:{},headers:{}}),false);
  assert.equal(accepts(probes()[0],{status:200,body:{result:'mainnet'},headers:{}}),false);
  assert.equal(accepts(probes().find(x=>x.denyOrigin),{status:403,body:{error:{code:'ORIGIN_REJECTED'}},headers:{'access-control-allow-origin':'*'}}),false);
});
test('audit runtime admission rejects a changed synthetic identity before protocol probes',async()=>{const f=fake('wrongRuntime'),r=await run(f.fetcher);assert.equal(r.passed,false);assert.equal(f.seen.length,1);});
test('unexpected forbidden-method success stops audit without retry or further requests',async()=>{const f=fake('unexpectedSuccess'),r=await run(f.fetcher);assert.equal(r.passed,false);assert.equal(r.checks.at(-1).passed,false);assert.equal(f.seen.filter(x=>JSON.parse(x.options.body??'{}').method==='requestAirdrop').length,1);});
test('bounded responses stop before recording oversized observations',async()=>{const f=fake('oversize'),r=await run(f.fetcher);assert.equal(r.passed,false);assert.match(r.failure,/bound/);});
test('complete synthetic protocol plan handles bodyless204 and repeated identity checks',async()=>{const f=fake(),r=await run(f.fetcher);assert.equal(r.passed,true);assert.equal(r.checks.length,25);assert.equal(r.requests,28);assert.equal(r.validFaucetRequests,0);assert.equal(r.signedTransactions,0);assert(f.seen.every(x=>x.url.startsWith('https://network-release-production.up.railway.app/')));});
