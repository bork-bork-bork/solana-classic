import Fastify from 'fastify';
import cors from '@fastify/cors';
import sharp from 'sharp';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Connection } from '@solana/web3.js';
import { z } from 'zod';
import { assetInputSchema, galleryInputSchema, MEME_SUPPLY, type AssetDocument, type GalleryEntry } from '@solana-classic/config';
import { assertNetwork, verifyAsset, currentNftOwner } from '@solana-classic/chain';

const GENESIS = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const GATEWAY = 'https://network-release-production.up.railway.app';
const SITE = 'https://solanaclassic.net';
const GATEWAY_ORIGIN = 'https://solana-classic-soc.vercel.app';
const MAX_INPUT = 1_048_576, MAX_OUTPUT = 2_097_152, MAX_STORAGE = 536_870_912;
sharp.cache(false); sharp.concurrency(1);
export async function normalizeImage(data: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length > Math.ceil(MAX_INPUT / 3) * 4) throw new Error('Choose a PNG or JPG image up to 1 MB.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > MAX_INPUT || bytes.toString('base64') !== data) throw new Error('Invalid image encoding.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new Error('Choose a PNG or JPG image.');
  const pipeline = sharp(bytes, { failOn: 'warning', limitInputPixels: 4_194_304 });
  const info = await pipeline.metadata();
  if (!['png', 'jpeg'].includes(info.format ?? '') || (info.pages ?? 1) > 1) throw new Error('Choose a still PNG or JPG image.');
  const output = await pipeline.autoOrient().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  if (output.length > MAX_OUTPUT) throw new Error('Image is too large after processing. Choose a simpler image.');
  return output;
}
export async function createImageApp(dataDir: string, origin: string, testConnection?: Connection) {
  const app = Fastify({ bodyLimit: 1_500_000, logger: false, trustProxy: (_ip, hop) => hop === 0 });
  mkdirSync(dataDir, { recursive: true });
  const assetsDir = join(dataDir, 'assets'); mkdirSync(assetsDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'images.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA max_page_count=16384; CREATE TABLE IF NOT EXISTS assets(hash TEXT PRIMARY KEY,mint TEXT UNIQUE,document TEXT NOT NULL,signature TEXT,verified_at TEXT); CREATE TABLE IF NOT EXISTS counters(key TEXT PRIMARY KEY,count INTEGER NOT NULL);');
  const diskBytes = (dir: string): number => readdirSync(dir).reduce((sum, name) => { const file=join(dir,name); const stat=statSync(file); return sum+(stat.isDirectory()?diskBytes(file):stat.size); },0);
  let usedBytes=diskBytes(assetsDir), processing=false;
  const reads = new Map<string,{until:number,count:number}>();
  const connection = testConnection ?? new Connection(GATEWAY + '/api/rpc', { commitment:'finalized', disableRetryOnRateLimit:true, httpHeaders:{ Origin:GATEWAY_ORIGIN } });
  const guard = async () => { await assertNetwork(connection, GENESIS); };
  const remote = async (path:string) => {
    const response=await fetch(GATEWAY+path,{headers:{Origin:GATEWAY_ORIGIN},signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw Object.assign(new Error('Gallery is temporarily unavailable.'),{statusCode:503});
    return response.json();
  };
  await app.register(cors,{origin:SITE,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type'],credentials:false});
  app.addHook('onRequest',async request=>{
    if(!request.url.startsWith('/assets/') && request.headers.origin && request.headers.origin!==SITE)throw Object.assign(new Error('Browser origin is not allowed.'),{statusCode:403});
    if(request.method==='POST' && request.headers.origin!==SITE)throw Object.assign(new Error('Browser origin is required.'),{statusCode:403});
    const now=Date.now(); const counter=reads.get(request.ip); const next=counter && counter.until>now?counter:{until:now+60000,count:0};
    if(reads.size>=10000)for(const [key,value] of reads)if(value.until<now)reads.delete(key);
    if(++next.count>300 || (!counter && reads.size>=10000))throw Object.assign(new Error('Too many requests. Try again shortly.'),{statusCode:429});reads.set(request.ip,next);
  });
  app.addHook('onSend',async(request,reply)=>{reply.header('X-Content-Type-Options','nosniff');if(request.url.startsWith('/api/'))reply.header('Cache-Control','no-store');});
  app.setErrorHandler((error,_request,reply)=>{
    const known:Error & {statusCode?:number}=error instanceof Error?error:new Error('Image service unavailable.');
    const status=error instanceof z.ZodError?400:(known.statusCode && known.statusCode<500?known.statusCode:503);
    reply.code(status).send({error:{code:'IMAGE_SERVICE',message:status<500?known.message:'The image service could not complete this request.'}});
  });
  app.get('/health',async()=>({state:'online',genesis:GENESIS,scope:'Isolated persistent image and gallery service; no validator or signing keys'}));
  app.post('/api/assets',async request=>{
    const input=assetInputSchema.extend({imageData:z.string().max(1_398_104)}).parse(request.body);
    await guard();
    if(processing)throw Object.assign(new Error('Another image is processing. Try again shortly.'),{statusCode:429});
    processing=true;
    try{
      let image:Buffer; try{image=await normalizeImage(input.imageData);}catch(error){throw Object.assign(error as Error,{statusCode:400});}
      const {imageData:_imageData,...base}=input;
      const imageHash=createHash('sha256').update(image).digest('hex');
      const hash=createHash('sha256').update(JSON.stringify({version:1,genesis:GENESIS,...base,imageHash})).digest('hex');
      const previous=db.prepare('SELECT document FROM assets WHERE hash=?').get(hash) as {document:string}|undefined;
      if(previous)return JSON.parse(previous.document);
      if(db.prepare('SELECT hash FROM assets WHERE mint=?').get(input.mint))throw Object.assign(new Error('This mint already has immutable artwork.'),{statusCode:409});
      const document:AssetDocument={...base,contentHash:hash,uri:origin+'/assets/'+hash+'/metadata.json',image:origin+'/assets/'+hash+'/image.png'};
      const metadata=Buffer.from(JSON.stringify({name:input.name,symbol:input.symbol,description:'Community-uploaded art on the Solana Classic experimental testnet. No monetary value or future conversion entitlement.',image:document.image,attributes:[{trait_type:'Network',value:'Experimental testnet'}],properties:{files:[{uri:document.image,type:'image/png'}]}}));
      if(usedBytes+image.length+metadata.length>MAX_STORAGE)throw Object.assign(new Error('Image storage is full. New uploads are paused.'),{statusCode:507});
      const day=new Date().toISOString().slice(0,10);
      const keys=[['global:'+day,200],['ip:'+request.ip+':'+day,30]] as const;
      for(const [key,max] of keys){const row=db.prepare('SELECT count FROM counters WHERE key=?').get(key) as {count:number}|undefined;if((row?.count??0)>=max)throw Object.assign(new Error('The daily image limit has been reached.'),{statusCode:429});}
      const dir=join(assetsDir,hash);mkdirSync(dir,{recursive:true}); const created:string[]=[];
      db.exec('BEGIN IMMEDIATE');
      try{
        for(const [name,bytes] of [['image.png',image],['metadata.json',metadata]] as const){const path=join(dir,name);if(existsSync(path)){if(!readFileSync(path).equals(bytes))throw Error('Immutable file differs.');}else{writeFileSync(path,bytes,{flag:'wx',mode:0o644});created.push(path);}}
        db.prepare('INSERT INTO assets(hash,mint,document) VALUES(?,?,?)').run(hash,input.mint,JSON.stringify(document));
        for(const [key] of keys)db.prepare('INSERT INTO counters(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key);
        db.exec('COMMIT'); usedBytes=diskBytes(assetsDir);
      }catch(error){db.exec('ROLLBACK');for(const path of created)unlinkSync(path);throw error;}
      return document;
    }finally{processing=false;}
  });
  app.get<{Params:{hash:string,file:string}}>('/assets/:hash/:file',async(request,reply)=>{
    const {hash,file}=request.params;if(!/^[a-f0-9]{64}$/.test(hash)||!['image.png','metadata.json'].includes(file))return reply.code(404).send({error:{message:'Asset not found.'}});
    if(!db.prepare('SELECT hash FROM assets WHERE hash=?').get(hash))return reply.code(404).send({error:{message:'Asset not found.'}});
    reply.header('Cache-Control','public,max-age=31536000,immutable');reply.header('Content-Security-Policy',"default-src 'none'; sandbox");
    return reply.type(file==='image.png'?'image/png':'application/json; charset=utf-8').send(readFileSync(join(assetsDir,hash,file)));
  });
  const entry=(row:{document:string,signature:string,verified_at:string}):GalleryEntry=>({...JSON.parse(row.document),issuanceSignature:row.signature,verifiedAt:row.verified_at});
  app.post('/api/gallery',async request=>{
    const input=galleryInputSchema.parse(request.body);await guard();
    const row=db.prepare('SELECT document FROM assets WHERE hash=? AND mint=?').get(input.contentHash,input.mint) as {document:string}|undefined;
    if(!row)throw Object.assign(new Error('Mint and uploaded artwork do not match.'),{statusCode:400});
    const asset=JSON.parse(row.document) as AssetDocument;
    const transaction=await connection.getParsedTransaction(input.issuanceSignature,{commitment:'finalized',maxSupportedTransactionVersion:0});
    if(!transaction?.meta || transaction.meta.err!==null)throw Object.assign(new Error('Issuance is not yet a successful finalised transaction.'),{statusCode:409});
    const expected=(asset.kind==='nft'?1n:MEME_SUPPLY).toString();
    const issued=transaction.transaction.message.instructions.some(ix=>{if(!('parsed' in ix)||ix.programId.toBase58()!=='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')return false;const p=ix.parsed;return p.info?.mint===asset.mint && ((p.type==='mintTo' && p.info.amount===expected)||(p.type==='mintToChecked' && p.info.tokenAmount?.amount===expected));});
    if(!issued)throw Object.assign(new Error('The supplied transaction does not issue this mint.'),{statusCode:400});
    await verifyAsset(connection,asset);
    db.prepare('UPDATE assets SET signature=COALESCE(signature,?),verified_at=COALESCE(verified_at,?) WHERE hash=?').run(input.issuanceSignature,new Date().toISOString(),input.contentHash);
    return entry(db.prepare('SELECT document,signature,verified_at FROM assets WHERE hash=?').get(input.contentHash) as never);
  });
  app.get<{Querystring:{cursor?:string,limit?:string}}>('/api/gallery',async request=>{
    const offset=Number(request.query.cursor??0),limit=Number(request.query.limit??20);
    if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Object.assign(new Error('Invalid gallery pagination.'),{statusCode:400});
    const total=(db.prepare('SELECT count(*) AS count FROM assets WHERE signature IS NOT NULL').get() as {count:number}).count;
    const rows=db.prepare('SELECT document,signature,verified_at FROM assets WHERE signature IS NOT NULL ORDER BY verified_at DESC,mint LIMIT ? OFFSET ?').all(limit+1,offset).map(row=>entry(row as never));
    if(rows.length>limit)return{entries:rows.slice(0,limit),nextCursor:String(offset+limit)};
    const remaining=limit-rows.length;
    const legacy=await remote('/api/gallery?cursor='+Math.max(0,offset-total)+'&limit='+Math.min(50,Math.max(1,remaining+1))) as {entries:GalleryEntry[],nextCursor:string|null};
    const combined=[...rows,...legacy.entries];return{entries:combined.slice(0,limit),nextCursor:combined.length>limit||legacy.nextCursor!==null?String(offset+limit):null};
  });
  app.get<{Params:{mint:string}}>('/api/gallery/:mint',async request=>{
    const mint=z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).parse(request.params.mint);
    const row=db.prepare('SELECT document,signature,verified_at FROM assets WHERE mint=? AND signature IS NOT NULL').get(mint);
    if(!row)return remote('/api/gallery/'+mint);
    await guard();const item=entry(row as never);if(item.kind==='meme')return item;
    const owner=await currentNftOwner(connection,mint);return{...item,currentOwner:owner,ownershipState:owner?'held':'burned'};
  });
  app.addHook('onClose',async()=>db.close());
  return app;
}
if(process.env.SC_IMAGE_START==='1'){
  const origin=new URL(process.env.SC_IMAGE_ORIGIN??'').origin;
  if(!origin.endsWith('.up.railway.app')||!origin.startsWith('https://')||process.env.RAILWAY_VOLUME_MOUNT_PATH!=='/data')throw Error('Permanent HTTPS image origin and persistent /data volume required.');
  const app=await createImageApp('/data',origin);await app.listen({host:'0.0.0.0',port:Number(process.env.PORT??8080)});
}
