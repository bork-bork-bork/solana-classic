// Private-network, read-only block adapter. No signing keys or ledger files are read.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
export const GENESIS='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const methods=new Set(['getGenesisHash','getSlot','getFirstAvailableBlock','getBlocks','getBlock','getSignaturesForAddress']);
export async function loopbackRpc(method,params=[]){
  if(!methods.has(method))throw Error('Read method not allowed.');
  const response=await fetch('http://127.0.0.1:8899',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'block-reader',method,params}),signal:AbortSignal.timeout(8000)});
  if(!response.ok||!response.body)throw Error('RPC unavailable.');
  const chunks=[];let size=0;const reader=response.body.getReader();
  while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>2097152){await reader.cancel();throw Error('Block response exceeds limit.');}chunks.push(next.value);}
  const data=JSON.parse(Buffer.concat(chunks).toString());if(data.error||data.id!=='block-reader')throw Error('Block response unavailable.');return data.result;
}
export async function readTransactions(cursor,rpc=loopbackRpc){
  if(await rpc('getGenesisHash')!==GENESIS)throw Error('Experimental genesis differs.');
  const [finalizedSlot,earliestAvailableSlot]=await Promise.all([rpc('getSlot',[{commitment:'finalized'}]),rpc('getFirstAvailableBlock')]);
  if(!Number.isSafeInteger(finalizedSlot)||!Number.isSafeInteger(earliestAvailableSlot))throw Error('Invalid slot response.');
  let slot=finalizedSlot,index=0;
  if(cursor){if(!/^\d{1,10}:\d{1,4}$/.test(cursor))throw Object.assign(Error('Invalid transaction cursor.'),{status:400});[slot,index]=cursor.split(':').map(Number);if(slot>finalizedSlot||slot<earliestAvailableSlot||index>4096)throw Object.assign(Error('This block is outside retained history.'),{status:400});}
  const slots=await rpc('getBlocks',[Math.max(earliestAvailableSlot,slot-127),slot,{commitment:'finalized'}]);
  if(!Array.isArray(slots)||slots.some(s=>!Number.isSafeInteger(s)||s<earliestAvailableSlot||s>slot)||slots.length>128)throw Error('Invalid retained block window.');
  const entries=[];let nextCursor=null;let scanned=0;
  for(const current of slots.sort((a,b)=>b-a)){
    if(scanned++>=25){nextCursor=current+':0';break;}
    const block=await rpc('getBlock',[current,{encoding:'jsonParsed',transactionDetails:'full',rewards:false,commitment:'finalized',maxSupportedTransactionVersion:0}]);
    if(!block)continue;if(!Array.isArray(block.transactions)||block.transactions.length>4096)throw Error('Invalid block transactions.');
    const from=current===slot?index:0;
    for(let offset=from;offset<block.transactions.length;offset++){
      if(entries.length>=25){nextCursor=current+':'+offset;break;}
      const tx=block.transactions[offset],signature=tx.transaction?.signatures?.[0];if(!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature??''))throw Error('Invalid chain signature.');
      const instructions=tx.transaction.message?.instructions??[];
      const programs=instructions.map(ix=>ix.programId);
      const kind=programs.includes('Vote111111111111111111111111111111111111111')?'Vote':programs.includes('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')?'Token / NFT':programs.includes('11111111111111111111111111111111')?'Transfer / System':'Other';
      entries.push({signature,slot:current,blockTime:Number.isSafeInteger(block.blockTime)?block.blockTime:null,status:tx.meta?.err?'Failed':'Finalized',fee:Number.isSafeInteger(tx.meta?.fee)?tx.meta.fee:null,kind});
    }
    if(nextCursor)break;
  }
  if(!nextCursor && slots.length && Math.min(...slots)>earliestAvailableSlot)nextCursor=(Math.min(...slots)-1)+':0';
  return{genesis:GENESIS,finalizedSlot,earliestAvailableSlot,entries,nextCursor,at:new Date().toISOString()};
}
export async function readAddressTransactions(address,before,rpc=loopbackRpc){
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address??'')||(before&&!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(before)))throw Object.assign(Error('Invalid address cursor.'),{status:400});
  if(await rpc('getGenesisHash')!==GENESIS)throw Error('Experimental genesis differs.');
  const [finalizedSlot,earliestAvailableSlot,rows]=await Promise.all([rpc('getSlot',[{commitment:'finalized'}]),rpc('getFirstAvailableBlock'),rpc('getSignaturesForAddress',[address,{limit:25,commitment:'finalized',...(before?{before}:{})}])]);
  if(!Array.isArray(rows)||rows.length>25||!Number.isSafeInteger(finalizedSlot)||!Number.isSafeInteger(earliestAvailableSlot))throw Error('Invalid address history.');
  const entries=rows.map(row=>{if(!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(row.signature)||!Number.isSafeInteger(row.slot))throw Error('Invalid address transaction.');return{signature:row.signature,slot:row.slot,blockTime:Number.isSafeInteger(row.blockTime)?row.blockTime:null,status:row.err?'Failed':'Finalized',kind:'Address activity',fee:null};});
  return{genesis:GENESIS,finalizedSlot,earliestAvailableSlot,entries,nextCursor:rows.length===25?rows.at(-1).signature:null,at:new Date().toISOString()};
}
export function createBlockReader(rpc=loopbackRpc){
  let active=0;const cache=new Map();
  return createServer(async(request,response)=>{
    response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');
    const fail=(status,message)=>{response.statusCode=status;response.end(JSON.stringify({error:{message}}));};
    if(request.method!=='GET')return fail(405,'Read-only endpoint.');
    if((request.url??'').length>200)return fail(400,'Invalid request.');
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/health'&&!url.search)return response.end(JSON.stringify({state:'online',scope:'Private read-only block adapter'}));
    const addressRoute=url.pathname==='/address-transactions';
    if(addressRoute){if([...url.searchParams.keys()].some(k=>!['address','before'].includes(k))||url.searchParams.getAll('address').length!==1||url.searchParams.getAll('before').length>1)return fail(404,'Route not found.');}
    else if(url.pathname!=='/transactions'||[...url.searchParams.keys()].some(k=>k!=='cursor')||url.searchParams.getAll('cursor').length>1)return fail(404,'Route not found.');
    const cursor=url.searchParams.get('cursor')??'';
    if(cursor&&!/^\d{1,10}:\d{1,4}$/.test(cursor))return fail(400,'Invalid cursor.');
    const cacheKey=addressRoute?url.pathname+url.search:cursor;
    const previous=cache.get(cacheKey);if(previous && Date.now()-previous.at<10000)return response.end(previous.body);
    if(active>=2)return fail(429,'Block reader is busy. Try again shortly.');active++;
    try{const result=addressRoute?await readAddressTransactions(url.searchParams.get('address'),url.searchParams.get('before'),rpc):await readTransactions(cursor,rpc);const body=JSON.stringify(result);if(cache.size>=16)cache.clear();cache.set(cacheKey,{at:Date.now(),body});response.end(body);}catch(error){fail(error.status??503,'Finalized transactions are temporarily unavailable.');}finally{active--;}
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)createBlockReader().listen(3002,'::');
