import test from 'node:test';import assert from 'node:assert/strict';
import handler,{allowedPath} from './api/uploaded-asset-proxy.js';
const path='a'.repeat(64)+'/image.png';
test('only exact immutable public PNG/JSON reads are admitted',()=>{
  assert.equal(allowedPath({method:'GET',url:'/api/uploaded-asset-proxy?path='+path}),path);
  for(const [method,url] of [['POST','?path='+path],['GET','?path='+path+'&url=https://evil.invalid'],['GET','?path=../../secret'],['GET','?path='+path+'&path='+path],['GET','?path='+path.replace('.png','.svg')]])assert.equal(allowedPath({method,url}),null);
});
test('fixed upstream receives no caller auth; oversized or invalid media is refused',async()=>{
  const old=globalThis.fetch;try{
    for(const [bytes,type,expected] of [[Buffer.from([137,80,78,71,13,10,26,10]),'image/png',200],[Buffer.from('bad'),'image/png',503],[Buffer.alloc(2097153),'image/png',503],[Buffer.from('{}'),'text/html',502]]){
      globalThis.fetch=async(url,options)=>{assert.equal(url,'https://image-assets-production.up.railway.app/assets/'+path);assert.deepEqual(options.headers,{Origin:'https://solanaclassic.net'});assert.equal(options.redirect,'error');return new Response(bytes,{headers:{'Content-Type':type}});};
      const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(b){this.body=b;}};
      await handler({method:'GET',url:'?path='+path,headers:{authorization:'not-forwarded'}},res);assert.equal(res.statusCode,expected);
    }
  }finally{globalThis.fetch=old;}
});
