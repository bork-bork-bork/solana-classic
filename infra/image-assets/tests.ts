import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Keypair, type Connection } from '@solana/web3.js';
import { normalizeImage, createImageApp } from './server.ts';

const genesis='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const fake=(actual:string)=>({getGenesisHash:async()=>actual}) as unknown as Connection;
const image=await sharp({create:{width:32,height:32,channels:3,background:'#1c9b68'}}).png().toBuffer();
const data=image.toString('base64');
test('Decode real PNG and JPEG pixels into bounded PNGs',async()=>{
  const png=await normalizeImage(data);assert.equal((await sharp(png).metadata()).format,'png');
  const jpeg=await sharp(image).jpeg().toBuffer();assert.equal((await sharp(await normalizeImage(jpeg.toString('base64'))).metadata()).width,32);
});
test('Reject SVG, corrupt rasters, invalid base64 and oversized files',async()=>{
  for(const bytes of [Buffer.from('<svg onload="alert(1)"/>'),Buffer.from([137,80,78,71,13,10,26,10,0]),Buffer.alloc(1048577)])await assert.rejects(normalizeImage(bytes.toString('base64')));
  await assert.rejects(normalizeImage('not-base64!'));
});
test('Reject oversized decoded dimensions before image processing',async()=>{
  const huge=await sharp({create:{width:2100,height:2100,channels:3,background:'#fff'}}).png().toBuffer();
  await assert.rejects(normalizeImage(huge.toString('base64')));
});
test('Uploaded assets are immutable, retry safely, survive reopening and bind their metadata image',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'soc-images-'));let app=await createImageApp(dir,'https://images.example.test',fake(genesis));
  const input={mint:Keypair.generate().publicKey.toBase58(),kind:'nft',name:'Own Art',symbol:'ART',presetId:0,imageData:data};
  const request={method:'POST' as const,url:'/api/assets',headers:{origin:'https://solanaclassic.net'},payload:input};
  try{
    const first=await app.inject(request);assert.equal(first.statusCode,200);const document=first.json();
    const repeat=await app.inject(request);assert.deepEqual(repeat.json(),document);
    const metadata=await app.inject({method:'GET',url:new URL(document.uri).pathname});assert.equal(metadata.json().image,document.image);
    const raster=await app.inject({method:'GET',url:new URL(document.image).pathname});assert.equal(raster.headers['content-type'],'image/png');assert.match(raster.headers['cache-control'] as string,/immutable/);
    await app.close();app=await createImageApp(dir,'https://images.example.test',fake(genesis));
    assert.deepEqual((await app.inject({method:'GET',url:new URL(document.image).pathname})).rawPayload,raster.rawPayload);
    const different=await sharp(image).negate().png().toBuffer();assert.equal((await app.inject({...request,payload:{...input,imageData:different.toString('base64')}})).statusCode,409);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
test('Reject unapproved origins and unknown fields before storing artwork',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'soc-images-'));const app=await createImageApp(dir,'https://images.example.test',fake(genesis));
  const payload={mint:Keypair.generate().publicKey.toBase58(),kind:'meme',name:'Meme',symbol:'MEME',presetId:1,imageData:data};
  try{
    assert.equal((await app.inject({method:'POST',url:'/api/assets',payload,headers:{origin:'https://evil.example'}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/assets',payload})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/assets',payload:{...payload,path:'../../bad'},headers:{origin:'https://solanaclassic.net'}})).statusCode,400);
    assert.equal((await app.inject({method:'GET',url:'/assets/invalid/image.png'})).statusCode,404);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
test('Wrong or public chain cannot create an uploaded asset',async()=>{
  for(const actual of ['wrong','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d']){
    const dir=mkdtempSync(join(tmpdir(),'soc-images-'));const app=await createImageApp(dir,'https://images.example.test',fake(actual));
    try{assert.equal((await app.inject({method:'POST',url:'/api/assets',headers:{origin:'https://solanaclassic.net'},payload:{mint:Keypair.generate().publicKey.toBase58(),kind:'nft',name:'Art',symbol:'ART',presetId:0,imageData:data}})).statusCode,503);}finally{await app.close();rmSync(dir,{recursive:true,force:true});}
  }
});
test('Uploaded gallery does not accept a foreign mint or invented issuance',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'soc-images-'));const app=await createImageApp(dir,'https://images.example.test',fake(genesis));
  try{assert.equal((await app.inject({method:'POST',url:'/api/gallery',headers:{origin:'https://solanaclassic.net'},payload:{mint:Keypair.generate().publicKey.toBase58(),contentHash:'a'.repeat(64),issuanceSignature:'1'.repeat(88)}})).statusCode,400);}finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
