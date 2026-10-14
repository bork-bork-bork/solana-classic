// Fixed devnet, read-only release review. No keys, funding or broadcast methods.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PublicKey} from '@solana/web3.js';
import {runtimeMatches} from './gateway-review.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const freeze=JSON.parse(readFileSync(ROOT+'evidence/candidate-freeze.json'));
const asset=JSON.parse(readFileSync(ROOT+'docs/token-program-release.json')).assets[0];
export const API='https://network-release-production.up.railway.app';
export const TOKEN='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111',LOADER2='BPFLoader2111111111111111111111111111111111';
const PUBLIC=new Set(['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']);
const DATA=PublicKey.findProgramAddressSync([new PublicKey(TOKEN).toBuffer()],new PublicKey(LOADER))[0].toBase58();
const sha=b=>createHash('sha256').update(b).digest('hex');
const slot=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid finalized slot');return v;};
export function factsMatch(f,genesis){
  return genesis===freeze.genesis&&!PUBLIC.has(genesis)&&f?.expectedGenesisHash===genesis&&f.mode==='remote'&&f.denomination==='TEST'&&f.operatorCount===1&&f.hasMonetaryValue===false&&f.tokenProgram===TOKEN&&f.associatedTokenProgram===ATA&&typeof f.resetPolicy==='string'&&/No automatic reset\./.test(f.resetPolicy)&&/deliberate reset will be disclosed/.test(f.resetPolicy)&&/no monetary value/.test(f.resetPolicy);
}
function data(a,owner,executable){
  if(a?.owner!==owner||a.executable!==executable||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length>1398104)throw Error('Executable programme owner/data mismatch');
  const b=Buffer.from(a.data[0],'base64');if(b.length>1048576||b.toString('base64')!==a.data[0])throw Error('Noncanonical programme bytes');return b;
}
export function reviewAccounts(snapshot,minimum,expectedElf={bytes:asset.size,sha256:freeze.runtime.tokenProgramSha256}){
  if(slot(snapshot?.context?.slot)<slot(minimum)||!Array.isArray(snapshot.value)||snapshot.value.length!==3)throw Error('Programme snapshot is incomplete or precedes checkpoint');
  const token=data(snapshot.value[0],LOADER,true),ata=data(snapshot.value[1],LOADER2,true),pd=data(snapshot.value[2],LOADER,false);
  if(token.length!==36||token.readUInt32LE(0)!==2||!token.subarray(4).equals(new PublicKey(DATA).toBuffer()))throw Error('Token programme points to a different ProgramData');
  if(!Number.isSafeInteger(expectedElf.bytes)||expectedElf.bytes<4||expectedElf.bytes>1048531||pd.length<45+expectedElf.bytes||pd.readUInt32LE(0)!==3||![0,1].includes(pd[12]))throw Error('Invalid deployed Token-2022 layout');
  const elf=pd.subarray(45,45+expectedElf.bytes);
  if(elf.subarray(0,4).toString('hex')!=='7f454c46'||sha(elf)!==expectedElf.sha256||pd.subarray(45+expectedElf.bytes).some(v=>v!==0))throw Error('Deployed Token-2022 code differs from official artifact');
  if(ata.length<4||ata.subarray(0,4).toString('hex')!=='7f454c46')throw Error('Associated token programme lacks ELF code');
  return {contextSlot:snapshot.context.slot,tokenProgram:TOKEN,associatedTokenProgram:ATA,programData:DATA,tokenElfBytes:elf.length,tokenElfSHA256:sha(elf),tokenUpgradeAuthority:pd[12]===1?new PublicKey(pd.subarray(13,45)).toBase58():null,associatedElfBytes:ata.length,associatedElfSHA256:sha(ata),bothExecutable:true};
}
async function json(path,body,fetcher){
  const r=await fetcher(API+path,{method:body?'POST':'GET',redirect:'error',headers:body?{'content-type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  if(!r.ok||!r.body)throw Error('Network review read unavailable');const reader=r.body.getReader(),chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>2097152)throw Error('Review response exceeds bound');chunks.push(Buffer.from(value));}}finally{await reader.cancel();reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function run(fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms))){
  const result={schemaVersion:1,at:new Date().toISOString(),scope:'remote fixed canonical-devnet identity, finalized progression, health and executable token-program review; no mutation',api:API,web:freeze.candidate.frontendOrigin,genesis:freeze.genesis,candidate:freeze.candidate,passed:false,mutationRequests:0,canonicalProcessChanged:false,releaseAccepted:false};
  const rpc=async(method,params=[])=>{const j=await json('/api/rpc',{jsonrpc:'2.0',id:'network-facts-review',method,params},fetcher);if(j.jsonrpc!=='2.0'||j.id!=='network-facts-review'||j.error||!Object.hasOwn(j,'result'))throw Error('Network review RPC rejected');return j.result;};
  try{
    result.runtimeBefore=await json('/api/runtime',null,fetcher);if(!runtimeMatches(result.runtimeBefore))throw Error('Original runtime differs');
    const genesis=await rpc('getGenesisHash');result.networkFacts=await json('/api/network',null,fetcher);if(!factsMatch(result.networkFacts,genesis))throw Error('Network facts or chain identity differs');
    result.status=await json('/api/status',null,fetcher);if(result.status.state!=='online'||result.status.genesisMatches!==true)throw Error('Gateway reports degraded identity or health');
    if(await rpc('getHealth')!=='ok')throw Error('Validator health failed');result.health='ok';
    result.version=await rpc('getVersion');if(result.version?.['solana-core']!==freeze.runtime.agaveVersion)throw Error('Runtime version differs');
    result.firstFinalizedSlot=slot(await rpc('getSlot',[{commitment:'finalized'}]));
    result.programmes=reviewAccounts(await rpc('getMultipleAccounts',[[TOKEN,ATA,DATA],{encoding:'base64',commitment:'finalized',minContextSlot:result.firstFinalizedSlot}]),result.firstFinalizedSlot);
    await pause(2500);result.lastFinalizedSlot=slot(await rpc('getSlot',[{commitment:'finalized'}]));
    if(result.lastFinalizedSlot<=result.firstFinalizedSlot||result.lastFinalizedSlot<result.programmes.contextSlot)throw Error('Finalized ledger is stalled or regressed');
    if(await rpc('getGenesisHash')!==genesis)throw Error('Genesis changed during review');
    result.runtimeAfter=await json('/api/runtime',null,fetcher);if(!runtimeMatches(result.runtimeAfter))throw Error('Runtime changed during review');
    result.frozenFilesUnchanged=Object.entries(freeze.coreFiles).every(([p,h])=>sha(readFileSync(ROOT+p))===h);if(!result.frozenFilesUnchanged)throw Error('Frozen core changed');
    result.passed=true;
  }catch(e){result.failure=String(e.message).slice(0,300);}result.completedAt=new Date().toISOString();return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  if(process.argv.length!==4||process.argv[2]!=='--ack'||process.argv[3]!=='read-only')throw Error('Use --ack read-only; targets are fixed');
  const r=await run(),path=ROOT+'evidence/network-facts-current-'+r.at.replace(/[^0-9TZ]/g,'')+'.json';writeFileSync(path,JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({passed:r.passed,evidence:path.slice(ROOT.length),firstFinalizedSlot:r.firstFinalizedSlot,lastFinalizedSlot:r.lastFinalizedSlot,failure:r.failure}));if(!r.passed)process.exitCode=1;
}
