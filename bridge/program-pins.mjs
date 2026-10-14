// Read-only private-chain code/policy admission. No signing, writes or broadcast.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {PUBLIC_GENESIS} from './sdk.mjs';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111';
const SOAKING='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const MAX_DATA=1024*1024,MAX_WIRE=2*1024*1024;
const hash=b=>createHash('sha256').update(b).digest('hex');
const key=v=>new PublicKey(v);
function digest(v){if(typeof v!=='string'||! /^[0-9a-f]{64}$/.test(v))throw new Error('Reviewed SHA256 pin required');return v;}
function slot(v){if(!Number.isSafeInteger(v)||v<0)throw new Error('Invalid finalized slot');return v;}
function endpoint(v){const u=new URL(v);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Explicit private loopback RPC required');return u.href;}
async function request(url,method,params,fetcher){
  const response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});
  if(!response.ok||!response.body)throw new Error('Private pin RPC unavailable');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_WIRE)throw new Error('Pin RPC response exceeds bound');chunks.push(Buffer.from(value));}}
  finally{await reader.cancel();reader.releaseLock();}
  const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(data.jsonrpc!=='2.0'||data.id!==1||data.error||!Object.hasOwn(data,'result'))throw new Error('Pin RPC rejected observation');return data.result;
}
function bytes(account,owner,executable){
  if(!account||account.owner!==owner||account.executable!==executable||!Array.isArray(account.data)||account.data.length!==2||account.data[1]!=='base64'||typeof account.data[0]!=='string'||account.data[0].length>Math.ceil(MAX_DATA/3)*4)throw new Error('Pinned account owner/layout mismatch');
  const b=Buffer.from(account.data[0],'base64');if(b.length>MAX_DATA||b.toString('base64')!==account.data[0])throw new Error('Noncanonical pinned account data');return b;
}
function verifySnapshot(snapshot,pins,programData,config,minimum){
  if(slot(snapshot?.context?.slot)<minimum||!Array.isArray(snapshot.value)||snapshot.value.length!==3)throw new Error('Pinned snapshot precedes checkpoint or lacks accounts');
  const program=bytes(snapshot.value[0],LOADER,true),data=bytes(snapshot.value[1],LOADER,false),policy=bytes(snapshot.value[2],pins.program,false);
  if(program.length!==36||program.readUInt32LE(0)!==2||!program.subarray(4).equals(key(programData).toBuffer()))throw new Error('Upgradeable programme pointer differs from derived ProgramData');
  if(data.length<45+pins.elfBytes||data.readUInt32LE(0)!==3||hash(data)!==pins.programDataSHA256)throw new Error('Deployed programme account differs from reviewed pin');
  if(pins.upgradeAuthority===null){if(data[12]!==0)throw new Error('Programme immutability pin differs');}
  else if(data[12]!==1||!data.subarray(13,45).equals(key(pins.upgradeAuthority).toBuffer()))throw new Error('Programme upgrade authority differs');
  if(hash(data.subarray(45,45+pins.elfBytes))!==pins.elfSHA256||data.subarray(45+pins.elfBytes).some(v=>v!==0))throw new Error('Programme code or unused capacity differs');
  if(policy.length!==382||policy.subarray(0,8).toString()!=='SCCFG001'||hash(policy.subarray(0,358))!==pins.policySHA256)throw new Error('Bridge policy differs from reviewed pin');
  for(const [offset,value] of [[8,pins.bridge],[40,pins.genesis],[72,pins.remoteGenesis],[104,pins.remoteProgram],[136,pins.originMint]])if(!policy.subarray(offset,offset+32).equals(key(value).toBuffer()))throw new Error('Bridge policy identity differs');
  const committee=Array.from({length:5},(_,i)=>new PublicKey(policy.subarray(168+i*32,200+i*32)).toBase58());
  if(new Set(committee).size!==5||committee.includes('11111111111111111111111111111111')||policy[328]>9||policy[329]!==9||policy[330]!==pins.side||policy[331]!==3||policy[340]>1||policy[341]>1||policy.readBigUInt64LE(332)===0n||policy.readBigUInt64LE(342)===0n||policy.readBigUInt64LE(350)<policy.readBigUInt64LE(342))throw new Error('Invalid bridge committee/precision/epoch/caps/pause policy');
  return {contextSlot:snapshot.context.slot,program:pins.program,programData,config,elfSHA256:pins.elfSHA256,elfBytes:pins.elfBytes,programDataSHA256:pins.programDataSHA256,upgradeAuthority:pins.upgradeAuthority,policySHA256:pins.policySHA256,epoch:policy.readBigUInt64LE(332).toString(),newLocksPaused:policy[340]===1,settlementPaused:policy[341]===1,transferLimitUnits:policy.readBigUInt64LE(342).toString(),dailyLimitUnits:policy.readBigUInt64LE(350).toString(),outstandingUnits:policy.readBigUInt64LE(374).toString()};
}

export async function observePinnedProgram({rpc,pins,minimumContextSlot=0},fetcher=fetch){
  const url=endpoint(rpc);slot(minimumContextSlot);
  if(!pins||![0,1].includes(pins.side)||!Number.isSafeInteger(pins.elfBytes)||pins.elfBytes<4||pins.elfBytes>MAX_DATA-45)throw new Error('Reviewed private programme pins required');
  pins=Object.freeze({...pins});
  for(const f of ['genesis','remoteGenesis','program','remoteProgram','bridge','originMint'])if(typeof pins[f]!=='string'||key(pins[f]).toBase58()!==pins[f])throw new Error('Canonical identity pins required');
  if(pins.genesis===pins.remoteGenesis||[pins.genesis,pins.remoteGenesis].some(g=>PUBLIC_GENESIS.has(g)||g===SOAKING))throw new Error('Public and soaking chains are forbidden');
  for(const f of ['elfSHA256','programDataSHA256','policySHA256'])digest(pins[f]);
  if(pins.upgradeAuthority!==null&&(typeof pins.upgradeAuthority!=='string'||key(pins.upgradeAuthority).toBase58()!==pins.upgradeAuthority))throw new Error('Explicit upgrade-authority pin required');
  const programData=PublicKey.findProgramAddressSync([key(pins.program).toBuffer()],key(LOADER))[0].toBase58(),config=PublicKey.findProgramAddressSync([Buffer.from('config'),key(pins.bridge).toBuffer()],key(pins.program))[0].toBase58();
  const genesis=await request(url,'getGenesisHash',[],fetcher);if(genesis!==pins.genesis)throw new Error('Pinned programme genesis mismatch');
  const observe=async minimum=>verifySnapshot(await request(url,'getMultipleAccounts',[[pins.program,programData,config],{encoding:'base64',commitment:'finalized',minContextSlot:minimum}],fetcher),pins,programData,config,minimum);
  const first=await observe(minimumContextSlot),second=await observe(first.contextSlot);
  if(await request(url,'getGenesisHash',[],fetcher)!==genesis)throw new Error('Genesis changed during pin observation');
  return {schemaVersion:1,state:'PINNED_PRIVATE_OBSERVATION',genesis,firstContextSlot:first.contextSlot,...second,observations:2,independentVerification:false,canSign:false,canBroadcast:false,productionReady:false};
}
