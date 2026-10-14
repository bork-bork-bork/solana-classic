import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest } from './proxy.js';
const request=(path,method='GET',headers={})=>({url:'/api/proxy?path='+encodeURIComponent(path),method,headers});
test('Block cross-origin mutations and arbitrary upstream paths',()=>{
  for(const path of ['https://evil.example','../../health','api/admin','api/rpc?url=https://evil.example'])assert.equal(validateRequest(request(path)).status,404);
  assert.equal(validateRequest(request('api/rpc','POST',{'content-type':'application/json',origin:'https://evil.example'})).status,403);
  assert.equal(validateRequest(request('api/rpc','POST',{'content-type':'application/json'})).status,403);
  assert.equal(validateRequest(request('api/runtime','DELETE')).status,405);
});
test('Keep ordinary gallery pagination while rejecting injected query parameters',()=>{
  assert.equal(validateRequest({url:'/api/proxy?path=api/gallery&cursor=20',method:'GET',headers:{}}).path,'api/gallery?cursor=20');
  assert.equal(validateRequest({url:'/api/proxy?path=api/gallery&url=https://evil.example',method:'GET',headers:{}}).status,404);
  assert.equal(validateRequest(request('api/upload-assets','POST',{origin:'https://solanaclassic.net','content-type':'application/json'})).status,200);
  assert.equal(validateRequest({url:'/api/proxy?path=api/address-transactions&address='+'1'.repeat(32),method:'GET',headers:{}}).status,200);
  assert.equal(validateRequest({url:'/api/proxy?path=api/address-transactions&address=bad',method:'GET',headers:{}}).status,404);
});
