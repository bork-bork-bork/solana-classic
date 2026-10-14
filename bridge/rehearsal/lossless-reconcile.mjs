// Reconcile copies of existing V1 journals against copied real Agave ledgers.
// No keys, new transactions, signing, simulation or broadcast methods.
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { PublicKey,Transaction } from '@solana/web3.js';
import { decodeEvent,encodeEvent,observeLocalEvent,PUBLIC_GENESIS } from './sdk.mjs';
import { reconcilePendingClaim,takeSubmissionAttempt } from './pending-claim.mjs';
import { parseNativeTransactionRPC } from './lossless-native-rpc.mjs';

const root='/data/bridge-journal-history-v1';
const sha=x=>createHash('sha256').update(x).digest('hex');
const k=x=>new PublicKey(x),pda=(seeds,p)=>PublicKey.findProgramAddressSync(seeds,p)[0];
const loader=k('BPFLoaderUpgradeab1e11111111111111111111111');
const inputs=JSON.parse(readFileSync(root+'/journal-input-private.json'));
assert.equal(inputs.length,2);
const records=inputs.map(({directory,id})=>({directory:root+'/'+directory,id,record:JSON.parse(readFileSync(root+'/'+directory+'/'+id+'.json'))}));
assert.deepEqual(records.map(x=>x.record.scope),['isolated-native-claim','isolated-origin-redemption']);
const endpoints=new Set(['http://127.0.0.1:20899/','http://127.0.0.1:21899/']);
const methods=new Set(['getGenesisHash','getAccountInfo','getMultipleAccounts','getSignatureStatuses','getTransaction','getBlockHeight']);
let requests=0;
async function readOnly(url,options) {
  assert(endpoints.has(String(url)));assert.equal(options.method,'POST');
  assert(methods.has(JSON.parse(options.body).method),'Only read-only methods are allowed');
  requests++;return fetch(url,options);
}
async function rpc(url,method,params=[]) {
  const response=await readOnly(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});
  assert(response.ok);const raw=await response.text();assert(raw.length<=(method==='getMultipleAccounts'?2*1024*1024:65536));
  const decoded=method==='getTransaction'?parseNativeTransactionRPC(raw):JSON.parse(raw);
  assert.equal(decoded.jsonrpc,'2.0');assert.equal(decoded.id,1);assert(!decoded.error);return {result:decoded.result,raw};
}
const sides=new Map();
for(const x of records) {
  const r=x.record,e=decodeEvent(Buffer.from(r.eventBase64,'base64'));
  assert.equal(r.state,'FINALIZED');assert.equal(r.attempts,1);
  assert(!PUBLIC_GENESIS.has(e.sourceChain)&&!PUBLIC_GENESIS.has(e.destinationChain));
  assert(![e.sourceChain,e.destinationChain].includes('7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'));
  x.event=e;x.tx=Transaction.from(Buffer.from(r.transactionBase64,'base64'));
  assert(x.tx.verifySignatures());assert.equal(sha(x.tx.serialize()),r.transactionHash);
  for(const [url,genesis,program] of [[r.rpc,e.destinationChain,e.destinationProgram],[r.sourceRpc,e.sourceChain,e.sourceProgram]]) {
    if(sides.has(url)){assert.equal(sides.get(url).genesis,genesis);continue;}
    const p=k(program),config=pda([Buffer.from('config'),k(e.bridge).toBuffer()],p);
    sides.set(url,{url,genesis,program:p,config,addresses:new Set([config.toBase58(),pda([Buffer.from('vault'),config.toBuffer()],p).toBase58(),program,pda([p.toBuffer()],loader).toBase58()])});
  }
  sides.get(r.sourceRpc).addresses.add(e.sourceEvent);
  for(const address of [r.id,e.recipient,...x.tx.instructions[0].keys.slice(6).filter(m=>!m.isSigner).map(m=>m.pubkey.toBase58())]) {
    if(address!=='11111111111111111111111111111111'&&address!=='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')sides.get(r.rpc).addresses.add(address);
  }
}
assert.equal(sides.size,2);
const proof={schemaVersion:1,scope:'Read-only retained-history admission and exact-metadata reconciliation when available, copied finalized V1 journals and copied real Agave ledgers; synthetic assets',state:'running',startedAt:new Date().toISOString(),canonicalNetworkChanged:false,productionReady:false,broadcasts:0,newSignedTransactions:0,checks:[],operations:[]};
const save=()=>writeFileSync(root+'/public-result.json',JSON.stringify(proof,null,2));
const pass=name=>{proof.checks.push(name);save();};
async function snapshot(s) {
  assert.equal((await rpc(s.url,'getGenesisHash')).result,s.genesis);
  const addresses=[...s.addresses],data=(await rpc(s.url,'getMultipleAccounts',[addresses,{encoding:'base64',commitment:'finalized'}])).result;
  assert(Number.isSafeInteger(data.context.slot));assert.equal(data.value.length,addresses.length);
  const elf=readFileSync(root+'/bridge.so');
  const accounts=data.value.map((a,i)=>{
    assert(a&&a.data?.[1]==='base64'&&Number.isSafeInteger(a.lamports));
    const bytes=Buffer.from(a.data[0],'base64');
    if(addresses[i]===s.config.toBase58()){assert.equal(a.owner,s.program.toBase58());assert.equal(bytes.length,382);assert.equal(bytes.readBigUInt64LE(374),600000n);}
    if(addresses[i]===s.program.toBase58())assert(a.executable&&a.owner===loader.toBase58());
    if(addresses[i]===pda([s.program.toBuffer()],loader).toBase58()){assert.equal(a.owner,loader.toBase58());assert(bytes.subarray(45,45+elf.length).equals(elf));}
    return {address:addresses[i],owner:a.owner,executable:a.executable,lamports:String(a.lamports),bytes:bytes.length,dataSHA256:sha(bytes)};
  });
  assert.equal((await rpc(s.url,'getGenesisHash')).result,s.genesis);return {slot:data.context.slot,accounts};
}
try {
  save();const baseline=[];for(const s of sides.values())baseline.push(await snapshot(s));
  proof.genesi=[...sides.values()].map(s=>s.genesis);proof.accountCounts=baseline.map(b=>b.accounts.length);
  pass('Copied ledgers retain exact private identities, V1 compiled programme bytes and both 600000-unit counters');
  for(const x of records) {
    const {record:r,event:e,tx}=x;
    const observation=await observeLocalEvent({rpc:r.sourceRpc,expectedGenesis:e.sourceChain,eventAddress:e.sourceEvent,expected:e,minimumContextSlot:r.sourceContextSlot},readOnly);
    assert(encodeEvent(observation.event).equals(Buffer.from(r.eventBase64,'base64')));
    const landed=(await rpc(r.rpc,'getTransaction',[r.signature,{encoding:'base64',commitment:'finalized',maxSupportedTransactionVersion:0}])).result;
    if(landed===null) {
      const journalHash=sha(readFileSync(x.directory+'/'+x.id+'.json'));
      const statuses=(await rpc(r.rpc,'getSignatureStatuses',[[r.signature],{searchTransactionHistory:true}])).result;
      await assert.rejects(reconcilePendingClaim(x.directory,x.id,readOnly),/Previously finalized claim is no longer verifiable/);
      assert.equal(sha(readFileSync(x.directory+'/'+x.id+'.json')),journalHash);
      pass(r.scope+': actual missing transaction history refuses finalized reacceptance and preserves all journal bytes');
      const requestCount=requests;await assert.rejects(takeSubmissionAttempt(x.directory,x.id,readOnly),/attempt already exists/);assert.equal(requests,requestCount);
      assert.equal(sha(readFileSync(x.directory+'/'+x.id+'.json')),journalHash);
      pass(r.scope+': missing-history operation cannot acquire another handoff or replacement transaction');
      proof.operations.push({id:r.id,signature:r.signature,eventHash:r.eventHash,transactionHash:r.transactionHash,state:r.state,attempts:r.attempts,verification:'history-unavailable',rpcTransactionResult:null,signatureStatus:statuses.value[0]===null?'unavailable':statuses.value[0].confirmationStatus,finalizedSourceEventMatches:true,signedBytesUnchanged:true,exactMetadataReconciled:false,productionReady:false});
      continue;
    }
    assert(landed&&landed.meta.err===null);assert.equal(sha(Buffer.from(landed.transaction[0],'base64')),r.transactionHash);
    const keys=tx.compileMessage().accountKeys,payer=keys.findIndex(key=>key.toBase58()===r.payer),recipient=keys.findIndex(key=>key.toBase58()===e.recipient);
    assert.equal(keys.length,landed.meta.preBalances.length);assert.equal(keys.length,landed.meta.postBalances.length);
    assert(landed.meta.preBalances[payer]>BigInt(Number.MAX_SAFE_INTEGER),'Actual large fee-payer metadata required');
    pass(r.scope+': real raw large-native balances, signed bytes and finalized source event verified');
    const before=JSON.parse(readFileSync(x.directory+'/'+x.id+'.json'));
    const result=await reconcilePendingClaim(x.directory,x.id,readOnly);
    assert.equal(result.state,'FINALIZED');assert.equal(result.signature,r.signature);assert.equal(result.transactionHash,r.transactionHash);assert.equal(result.eventHash,r.eventHash);assert.equal(result.attempts,1);
    const after=JSON.parse(readFileSync(x.directory+'/'+x.id+'.json'));assert.equal(after.transactionBase64,before.transactionBase64);assert.equal(after.finalizedSlot,landed.slot);
    pass(r.scope+': original signature/receipt and exact economic deltas reconcile without replacement or retry');
    const journalHash=sha(readFileSync(x.directory+'/'+x.id+'.json'));
    const corrupt=async(url,options)=>{
      const response=await readOnly(url,options);
      if(JSON.parse(options.body).method!=='getTransaction')return response;
      const changed=parseNativeTransactionRPC(await response.text());changed.result.meta.postBalances[recipient]+=1n;
      return new Response(JSON.stringify(changed,(_key,value)=>typeof value==='bigint'?JSON.rawJSON(value.toString()):value),{status:200,headers:{'Content-Type':'application/json'}});
    };
    await assert.rejects(reconcilePendingClaim(x.directory,x.id,corrupt),/movement/);
    assert.equal(sha(readFileSync(x.directory+'/'+x.id+'.json')),journalHash);
    const requestCount=requests;await assert.rejects(takeSubmissionAttempt(x.directory,x.id,readOnly),/attempt already exists/);assert.equal(requests,requestCount);
    assert.equal(sha(readFileSync(x.directory+'/'+x.id+'.json')),journalHash);
    pass(r.scope+': one-unit bad metadata and repeat handoff reject, preserving the finalized journal');
    proof.operations.push({...result,verification:'exact-metadata-reconciled',exactMetadataReconciled:true,finalizedSlot:landed.slot,accountCount:keys.length,payerPreNativeUnits:landed.meta.preBalances[payer].toString(),payerPostNativeUnits:landed.meta.postBalances[payer].toString(),recipientDeltaNativeUnits:(landed.meta.postBalances[recipient]-landed.meta.preBalances[recipient]).toString(),signedBytesUnchanged:true});
  }
  let i=0;for(const s of sides.values()){const current=await snapshot(s);assert.deepEqual(current.accounts,baseline[i++].accounts);}
  pass('All selected finalized bridge accounts unchanged; read-only method allowlist exercised and zero broadcasts');
  proof.readOnlyRequests=requests;proof.state='passed';proof.completedAt=new Date().toISOString();save();
  console.log(JSON.stringify({state:proof.state,checks:proof.checks.length,broadcasts:0}));
} catch(error){proof.state='failed';proof.failure=String(error.message).slice(0,800);save();throw error;}
