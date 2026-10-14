// Private rehearsal native-claim journal. No key creation, signing, broadcasts,
// fresh transaction construction or production endpoints. Keep records private.
import { constants, openSync, closeSync, fsyncSync, writeFileSync, readFileSync, renameSync, unlinkSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { PublicKey, Transaction } from '@solana/web3.js';
import { encodeEvent, decodeEvent, validateEvent, nativeClaimInstruction, exactNativeUnits, observeLocalEvent, PUBLIC_GENESIS } from './sdk.mjs';
const soaking='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const states=new Set(['PREPARED','SUBMISSION_ATTEMPTED','PENDING','EXPIRED_UNRESOLVED','CONSUMED_REVIEW_REQUIRED','FAILED_REVIEW_REQUIRED','FINALIZED']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=v=>new PublicKey(v);
function base58(bytes) {
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n=BigInt('0x'+Buffer.from(bytes).toString('hex')), result='';
  while(n){result=alphabet[Number(n%58n)]+result;n/=58n;}
  for(const b of bytes){if(b!==0)break;result='1'+result;}return result;
}
function endpoint(value) {
  const u=new URL(value);
  if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Only explicit loopback rehearsal RPCs are supported');
  return u.href;
}
function privateDirectory(directory) {
  const path=resolve(directory),stat=lstatSync(path);
  if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(path)!==path||(stat.mode&0o077)!==0)throw new Error('A real private directory with mode0700 is required');
  return path;
}
function persist(path,record,create=false) {
  const temporary=create?path:path+'.new';
  const fd=openSync(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,JSON.stringify(record));fsyncSync(fd);}finally{closeSync(fd);}
  if(!create)renameSync(temporary,path);
  const parent=openSync(resolve(path,'..'),constants.O_RDONLY);try{fsyncSync(parent);}finally{closeSync(parent);}
}
function verified(record) {
  if(record.schemaVersion!==1||record.scope!=='isolated-native-claim'||!states.has(record.state))throw new Error('Invalid private claim record');
  if(!Number.isSafeInteger(record.lastValidBlockHeight)||record.lastValidBlockHeight<1||!Number.isSafeInteger(record.minimumDestinationSlot)||record.minimumDestinationSlot<0||!Number.isSafeInteger(record.sourceContextSlot)||record.sourceContextSlot<1)throw new Error('Invalid finality/expiry checkpoint');
  if(record.attempts!==0&&record.attempts!==1)throw new Error('Invalid submission count');
  if((record.state==='PREPARED')!==(record.attempts===0))throw new Error('Submission state/count mismatch');
  endpoint(record.rpc);endpoint(record.sourceRpc);
  const event=decodeEvent(Buffer.from(record.eventBase64,'base64'));
  validateEvent(event,event);
  if(BigInt(record.sourceContextSlot)<event.slot)throw new Error('Source checkpoint precedes the signed event');
  for(const g of [event.sourceChain,event.destinationChain])if(PUBLIC_GENESIS.has(g)||g===soaking)throw new Error('Public and soaking chains are forbidden');
  if(record.expectedGenesis!==event.destinationChain||record.eventHash!==hash(encodeEvent(event)))throw new Error('Claim chain/message mismatch');
  if(record.payer===event.recipient||record.committee.includes(record.payer))throw new Error('Rehearsal payer must be separate from recipient/committee');
  exactNativeUnits(event.originAmount,record.originDecimals);
  const ix=nativeClaimInstruction({event,expected:event,payer:record.payer,committee:record.committee});
  if(record.id!==ix.keys[3].pubkey.toBase58())throw new Error('Wrong receipt-derived operation ID');
  const raw=Buffer.from(record.transactionBase64,'base64');
  if(raw.length>1232||raw.toString('base64')!==record.transactionBase64||hash(raw)!==record.transactionHash)throw new Error('Signed transaction bytes changed');
  const tx=Transaction.from(raw);
  if(!tx.verifySignatures()||!tx.serialize().equals(raw)||!tx.feePayer?.equals(key(record.payer))||tx.instructions.length!==1||base58(tx.signature)!==record.signature)throw new Error('Signed transaction authority/signature mismatch');
  const actual=tx.instructions[0];
  if(!actual.programId.equals(ix.programId)||!actual.data.equals(ix.data)||actual.keys.length!==ix.keys.length||actual.keys.some((m,i)=>!m.pubkey.equals(ix.keys[i].pubkey)||m.isSigner!==ix.keys[i].isSigner||m.isWritable!==ix.keys[i].isWritable))throw new Error('Signed transaction does not match the exact native claim');
  return {event,raw,tx,ix};
}
function locked(directory,id,action) {
  const root=privateDirectory(directory);
  if(typeof id!=='string'||! /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id))throw new Error('Invalid receipt ID');
  const path=join(root,id+'.json'),lock=path+'.lock';
  const fd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);closeSync(fd);
  return (async()=>{
    try{
      const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>16384)throw new Error('Invalid private record file');
      const record=JSON.parse(readFileSync(path,'utf8'));const checked=verified(record);
      return await action(record,checked,next=>persist(path,next));
    }finally{unlinkSync(lock);}
  })();
}
async function rpc(record,method,params,fetcher,source=false) {
  const r=await fetcher(source?record.sourceRpc:record.rpc,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error('Rehearsal RPC unavailable');
  const raw=await r.text();if(raw.length>65536)throw new Error('Rehearsal response exceeds bound');
  const d=JSON.parse(raw);if(d.jsonrpc!=='2.0'||d.id!==1||d.error||!Object.hasOwn(d,'result'))throw new Error('RPC rejected reconciliation');return d.result;
}
async function admit(record,fetcher) {
  if(await rpc(record,'getGenesisHash',[],fetcher)!==record.expectedGenesis)throw new Error('Destination genesis mismatch');
}
function summary(record) {return {id:record.id,signature:record.signature,eventHash:record.eventHash,transactionHash:record.transactionHash,state:record.state,attempts:record.attempts,productionReady:false};}

export function preparePendingClaim({directory,sourceRpc,rpc:destinationRpc,event,expected,payer,committee,transaction,lastValidBlockHeight,originDecimals,sourceContextSlot,minimumDestinationSlot=0}) {
  validateEvent(event,expected);
  const raw=Buffer.from(transaction),tx=Transaction.from(raw);
  const ix=nativeClaimInstruction({event,expected,payer,committee});
  const record={schemaVersion:1,scope:'isolated-native-claim',state:'PREPARED',attempts:0,id:ix.keys[3].pubkey.toBase58(),sourceRpc:endpoint(sourceRpc),rpc:endpoint(destinationRpc),expectedGenesis:event.destinationChain,payer:key(payer).toBase58(),committee:committee.map(k=>key(k).toBase58()),originDecimals,eventBase64:encodeEvent(event).toString('base64'),eventHash:hash(encodeEvent(event)),transactionBase64:raw.toString('base64'),transactionHash:hash(raw),signature:base58(tx.signature),lastValidBlockHeight,sourceContextSlot,minimumDestinationSlot,preparedAt:new Date().toISOString()};
  verified(record);
  const root=privateDirectory(directory);persist(join(root,record.id+'.json'),record,true);
  return summary(record);
}

// Returns the existing signed bytes once only. The caller may submit exactly
// those bytes to the pinned private RPC. A crash before submission remains
// uncertain; this API never authorizes another attempt or signs replacements.
export function takeSubmissionAttempt(directory,id,fetcher=fetch) {
  return locked(directory,id,async(record,{event,raw,ix},save)=>{
    if(record.state!=='PREPARED')throw new Error('An attempt already exists; reconcile it, do not submit again');
    await admit(record,fetcher);
    const height=await rpc(record,'getBlockHeight',[{commitment:'finalized'}],fetcher);
    if(!Number.isSafeInteger(height)||height<0||height>record.lastValidBlockHeight)throw new Error('Signed transaction expiry is not admissible');
    const receipt=await rpc(record,'getAccountInfo',[record.id,{encoding:'base64',commitment:'finalized',minContextSlot:record.minimumDestinationSlot}],fetcher);
    if(!Number.isSafeInteger(receipt?.context?.slot)||receipt.context.slot<record.minimumDestinationSlot||receipt.value!==null)throw new Error('Receipt already exists or destination context is invalid; reconcile first');
    const config=await rpc(record,'getAccountInfo',[ix.keys[1].pubkey.toBase58(),{encoding:'base64',commitment:'finalized',minContextSlot:record.minimumDestinationSlot}],fetcher);
    const c=config.value?.data?.[1]==='base64'?Buffer.from(config.value.data[0],'base64'):Buffer.alloc(0);
    if(!Number.isSafeInteger(config.context?.slot)||config.context.slot<record.minimumDestinationSlot||config.value?.owner!==event.destinationProgram||config.value.executable||c.length!==382||c.subarray(0,8).toString()!=='SCCFG001'||!c.subarray(8,40).equals(key(event.bridge).toBuffer())||!c.subarray(40,72).equals(key(event.destinationChain).toBuffer())||!c.subarray(72,104).equals(key(event.sourceChain).toBuffer())||!c.subarray(104,136).equals(key(event.sourceProgram).toBuffer())||c[328]!==record.originDecimals||c[329]!==9||c[330]!==1||c[331]!==3||c.readBigUInt64LE(332)!==event.epoch||c[341]!==0||record.committee.some(member=>![0,1,2,3,4].some(i=>c.subarray(168+i*32,200+i*32).equals(key(member).toBuffer()))))throw new Error('Native configuration/precision/quorum differs from signed claim');
    const observation=await observeLocalEvent({rpc:record.sourceRpc,expectedGenesis:event.sourceChain,eventAddress:event.sourceEvent,expected:event,minimumContextSlot:record.sourceContextSlot},fetcher);
    if(!encodeEvent(observation.event).equals(encodeEvent(event)))throw new Error('Source event bytes changed');
    await admit(record,fetcher);
    record.state='SUBMISSION_ATTEMPTED';record.attempts=1;record.attemptedAt=new Date().toISOString();save(record);
    return {rpc:record.rpc,rawTransaction:raw,signature:record.signature};
  });
}

export function reconcilePendingClaim(directory,id,fetcher=fetch) {
  return locked(directory,id,async(record,{event,raw,tx,ix},save)=>{
    await admit(record,fetcher);
    const receipt=await rpc(record,'getAccountInfo',[record.id,{encoding:'base64',commitment:'finalized',minContextSlot:record.minimumDestinationSlot}],fetcher);
    if(!Number.isSafeInteger(receipt?.context?.slot)||receipt.context.slot<record.minimumDestinationSlot)throw new Error('Destination context precedes recovery checkpoint');
    if(receipt.value&&(receipt.value.owner!==event.destinationProgram||receipt.value.executable||receipt.value.data?.[1]!=='base64'||!Buffer.from(receipt.value.data[0],'base64').equals(key(event.sourceEvent).toBuffer())))throw new Error('Conflicting consumed receipt; retain pending state for review');
    const statuses=await rpc(record,'getSignatureStatuses',[[record.signature],{searchTransactionHistory:true}],fetcher);
    if(!Array.isArray(statuses?.value)||statuses.value.length!==1)throw new Error('Invalid signature status response');
    const status=statuses.value[0];let next='PENDING';
    if(status?.confirmationStatus==='finalized'&&status.err)next='FAILED_REVIEW_REQUIRED';
    else if(status?.confirmationStatus==='finalized'&&status.err===null) {
      const landed=await rpc(record,'getTransaction',[record.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}],fetcher);
      if(!landed)next=receipt.value?'CONSUMED_REVIEW_REQUIRED':'PENDING';
      else {
        if(!receipt.value||landed.meta?.err!==null||!Number.isSafeInteger(landed.slot)||landed.slot!==status.slot||landed.slot>receipt.context.slot||landed.transaction?.[1]!=='base64'||!Buffer.from(landed.transaction[0],'base64').equals(raw))throw new Error('Finalized transaction/receipt mismatch');
        const keys=tx.compileMessage().accountKeys;const recipient=keys.findIndex(k=>k.toBase58()===event.recipient),vault=keys.findIndex(k=>k.equals(ix.keys[2].pubkey));
        const delta=index=>{const a=landed.meta.preBalances?.[index],b=landed.meta.postBalances?.[index];if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0)throw new Error('Invalid economic balance metadata');return BigInt(b)-BigInt(a);};
        const amount=exactNativeUnits(event.originAmount,record.originDecimals);
        if(delta(recipient)!==amount||delta(vault)!==-amount)throw new Error('Finalized native movement differs from signed event');
        record.finalizedSlot=landed.slot;next='FINALIZED';
      }
    } else if(receipt.value)next='CONSUMED_REVIEW_REQUIRED';
    else {
      const height=await rpc(record,'getBlockHeight',[{commitment:'finalized'}],fetcher);
      if(!Number.isSafeInteger(height)||height<0)throw new Error('Invalid finalized block height');
      next=height>record.lastValidBlockHeight?'EXPIRED_UNRESOLVED':record.state==='PREPARED'?'PREPARED':'PENDING';
    }
    await admit(record,fetcher);
    // Never regress a known finalized record because a later RPC is missing
    // history. Conflicting observations stop reconciliation and keep evidence.
    if(record.state==='FINALIZED'&&next!=='FINALIZED')throw new Error('Previously finalized claim is no longer verifiable');
    record.state=next;if(next!=='PREPARED')record.attempts=1;record.minimumDestinationSlot=receipt.context.slot;record.reconciledAt=new Date().toISOString();save(record);
    return summary(record);
  });
}
