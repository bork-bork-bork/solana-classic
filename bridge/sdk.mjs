// Prototype client: decoding, unsigned claim construction and local read-only
// observation. No private keys, broadcasts or public-chain access.
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
const zero='11111111111111111111111111111111';
export const EVENT_BYTES=297;
export const PUBLIC_GENESIS=new Set(['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']);
function key(value){return new PublicKey(value);}
function integer(value){if(typeof value!=='bigint'||value<0n||value>0xffffffffffffffffn)throw new Error('u64 requires an exact BigInt');const bytes=Buffer.alloc(8);bytes.writeBigUInt64LE(value);return bytes;}
export function decodeEvent(bytes){
  const b=Buffer.from(bytes);if(b.length!==EVENT_BYTES||b.subarray(0,8).toString()!=='SCEVT001')throw new Error('Unknown event encoding');
  let offset=8;const e={};for(const field of ['bridge','sourceChain','destinationChain','sourceProgram','destinationProgram','sourceEvent','sender','recipient']){e[field]=key(b.subarray(offset,offset+32)).toBase58();offset+=32;}
  for(const field of ['originAmount','nonce','slot','epoch']){e[field]=b.readBigUInt64LE(offset);offset+=8;}
  e.direction=b[offset];if(e.direction>1||e.originAmount===0n||e.slot===0n||e.recipient===zero||e.sourceEvent===zero)throw new Error('Invalid bridge event');return e;
}
export function encodeEvent(e){if(e.direction!==0&&e.direction!==1)throw new Error('Unknown bridge direction');return Buffer.concat([Buffer.from('SCEVT001'),...['bridge','sourceChain','destinationChain','sourceProgram','destinationProgram','sourceEvent','sender','recipient'].map(f=>key(e[f]).toBuffer()),...['originAmount','nonce','slot','epoch'].map(f=>integer(e[f])),Buffer.from([e.direction])]);}
export function exactNativeUnits(originAmount,originDecimals){
  if(!Number.isInteger(originDecimals)||originDecimals<0||originDecimals>9)throw new Error('Unsupported original precision');
  integer(originAmount);if(originAmount===0n)throw new Error('Zero amount');const native=originAmount*10n**BigInt(9-originDecimals);integer(native);return native;
}
export function validateEvent(e,expected){
  decodeEvent(encodeEvent(e));
  for(const name of ['bridge','sourceChain','destinationChain','sourceProgram','destinationProgram','recipient','epoch','direction']){
    if(e[name]!==expected[name])throw new Error('Event '+name+' mismatch');
  }
  if(e.sourceChain===e.destinationChain)throw new Error('Source and destination must differ');
  const config=PublicKey.findProgramAddressSync([Buffer.from('config'),key(e.bridge).toBuffer()],key(e.sourceProgram))[0];
  const event=PublicKey.findProgramAddressSync([Buffer.from('event'),config.toBuffer(),key(e.sender).toBuffer(),integer(e.nonce)],key(e.sourceProgram))[0];
  if(event.toBase58()!==e.sourceEvent)throw new Error('Source event PDA mismatch');
  return e;
}
export function nativeClaimInstruction({event,expected,payer,committee}){
  validateEvent(event,expected);if(event.direction!==0)throw new Error('Native release requires a lock event');
  if(!Array.isArray(committee)||committee.length!==3||new Set(committee.map(k=>key(k).toBase58())).size!==3)throw new Error('Exactly three distinct committee co-signers are required');
  const program=key(event.destinationProgram);const config=PublicKey.findProgramAddressSync([Buffer.from('config'),key(event.bridge).toBuffer()],program)[0];
  const vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],program)[0];
  const claim=PublicKey.findProgramAddressSync([Buffer.from('claim'),config.toBuffer(),key(event.sourceEvent).toBuffer()],program)[0];
  return new TransactionInstruction({programId:program,keys:[{pubkey:key(payer),isWritable:true,isSigner:true},{pubkey:config,isWritable:true,isSigner:false},{pubkey:vault,isWritable:true,isSigner:false},{pubkey:claim,isWritable:true,isSigner:false},{pubkey:key(event.recipient),isWritable:true,isSigner:false},{pubkey:key(zero),isWritable:false,isSigner:false},...committee.map(k=>({pubkey:key(k),isWritable:false,isSigner:true}))],data:Buffer.concat([Buffer.from([2]),encodeEvent(event)])});
}
function localEndpoint(rpc){const u=new URL(rpc);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash)throw new Error('Observation only supports an explicit loopback rehearsal RPC');return u;}
export async function observeLocalEvent({rpc,expectedGenesis,eventAddress,expected,minimumContextSlot=0},fetcher=fetch){
  const u=localEndpoint(rpc);if(!expectedGenesis||PUBLIC_GENESIS.has(expectedGenesis)||expectedGenesis==='7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon')throw new Error('Fresh isolated genesis is required');
  if(!Number.isSafeInteger(minimumContextSlot)||minimumContextSlot<0)throw new Error('Recovery context must be a nonnegative safe slot');
  async function request(method,params){const response=await fetcher(u,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('RPC unavailable');const body=await response.text();if(body.length>32768)throw new Error('RPC response exceeds bound');const data=JSON.parse(body);if(data.jsonrpc!=='2.0'||data.error||data.id!==1||!Object.hasOwn(data,'result'))throw new Error('RPC rejected observation');return data.result;}
  const genesis=await request('getGenesisHash',[]);if(genesis!==expectedGenesis||genesis!==expected.sourceChain)throw new Error('Source genesis mismatch');
  const snapshot=await request('getAccountInfo',[key(eventAddress).toBase58(),{encoding:'base64',commitment:'finalized',minContextSlot:minimumContextSlot}]);
  if(snapshot?.value?.owner!==expected.sourceProgram||snapshot.value.executable||!Array.isArray(snapshot.value.data)||snapshot.value.data[1]!=='base64')throw new Error('Event account owner or data is invalid');
  const event=validateEvent(decodeEvent(Buffer.from(snapshot.value.data[0],'base64')),expected);
  if(event.sourceEvent!==eventAddress||!Number.isSafeInteger(snapshot.context?.slot)||snapshot.context.slot<minimumContextSlot||BigInt(snapshot.context.slot)<event.slot)throw new Error('Finalized account context precedes the event or recovery checkpoint');
  // An RPC restart or endpoint replacement during the read must not admit an
  // event from a different chain. Never return cached observations on failure.
  if(await request('getGenesisHash',[])!==genesis)throw new Error('Source genesis changed during observation');
  return {state:'UNSIGNED_LOCAL_OBSERVATION',genesis,commitment:'finalized',contextSlot:snapshot.context.slot,event,signatures:[],productionReady:false};
}
