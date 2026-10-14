import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from './asset-proxy.js';
test('Immutable asset reader rejects arbitrary paths, URLs, methods and extra query parameters without fetching',async()=>{
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Should not fetch');};
  try{for(const request of [{method:'GET',url:'/api/asset-proxy?path=https://evil.example'},{method:'POST',url:'/api/asset-proxy?path='+'a'.repeat(64)+'/metadata.json'},{method:'GET',url:'/api/asset-proxy?path='+'a'.repeat(64)+'/metadata.json&url=http://evil.example'},{method:'GET',url:'/api/asset-proxy?path=../../private'}]){const response={setHeader(){},end(){},statusCode:0};await handler(request,response);assert.equal(response.statusCode,404);}assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
