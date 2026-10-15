// Read-only isolated native reserve and bootstrap observation. No keys or writes.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {normalizeProgramPins,observePinnedProgram} from './program-pins.mjs';
const MAX=(1n<<64n)-1n,MAX_WIRE=32768;
const hash=b=>createHash('sha256').update(b).digest('hex'),key=v=>new PublicKey(v);
const rentAddress='SysvarRent111111111111111111111111111111111',sysvarOwner='Sysvar1111111111111111111111111111111111111';
const numeric=['originSupplyUnits','totalNativeUnits','outsideNativeUnits','initialReserveNativeUnits','originAmount','protectedNativeUnits'];
function units(v){if(typeof v!=='string'||v.length>20||! /^(0|[1-9][0-9]*)$/.test(v)||BigInt(v)>MAX)throw new Error('Canonical exact native u64 units required');return BigInt(v);}
function slot(v){if(!Number.isSafeInteger(v)||v<0)throw new Error('Safe finalized native checkpoint required');return v;}
function endpoint(v){const u=new URL(v);if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('Explicit private loopback RPC required');return u.href;}
function witness(input,decimals){
 if(!input||!Number.isInteger(decimals)||decimals<0||decimals>9)throw new Error('Exact reviewed native witness and precision required');
 const w=Object.fromEntries(numeric.map(k=>[k,units(input[k])])),factor=10n**BigInt(9-decimals);
 if(typeof input.inventorySHA256!=='string'||! /^[a-f0-9]{64}$/.test(input.inventorySHA256)||typeof input.receipt!=='string'||key(input.receipt).toBase58()!==input.receipt||input.receipt==='11111111111111111111111111111111')throw new Error('Reviewed bootstrap digest and consumed receipt required');
 if(w.originSupplyUnits===0n||w.originAmount===0n||w.originAmount>w.originSupplyUnits||w.originSupplyUnits*factor>MAX||w.totalNativeUnits!==w.originSupplyUnits*factor||w.outsideNativeUnits+w.initialReserveNativeUnits!==w.totalNativeUnits||w.originAmount*factor-w.outsideNativeUnits!==w.protectedNativeUnits)throw new Error('Reviewed bootstrap arithmetic does not reconcile');
 return Object.freeze({...w,inventorySHA256:input.inventorySHA256,receipt:input.receipt,factor});
}
function bytes(a,owner,size){
 if(!a||a.owner!==owner||a.executable!==false||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length!==Math.ceil(size/3)*4)throw new Error('Native reserve account owner or layout differs');
 const b=Buffer.from(a.data[0],'base64');if(b.length!==size||b.toString('base64')!==a.data[0])throw new Error('Canonical native account bytes required');return b;
}
async function read(url,addresses,minimum,fetcher){
 const response=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[addresses,{encoding:'base64',commitment:'finalized',minContextSlot:minimum}]})});
 if(!response.ok||!response.body)throw new Error('Native reserve RPC unavailable');
 const reader=response.body.getReader(),chunks=[];let n=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>MAX_WIRE)throw new Error('Native reserve response exceeds bound');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel();reader.releaseLock();}
 const wire=JSON.parse(Buffer.concat(chunks).toString('utf8'),(k,v,context)=>{if(k!=='lamports')return v;if(typeof v!=='number'||typeof context?.source!=='string')throw new Error('Node24 exact numeric native balances required');return units(context.source);});
 if(wire?.jsonrpc!=='2.0'||wire.id!==1||wire.error||!Object.hasOwn(wire,'result'))throw new Error('Native reserve RPC rejected observation');
 const value=wire.result;if(slot(value?.context?.slot)<minimum||!Array.isArray(value.value)||value.value.length!==5)throw new Error('Native reserve snapshot lacks finalized accounts or precedes checkpoint');return value;
}
function decode(snapshot,pins,w,decimals,configKey){
 const [c,v,b,r,rent]=snapshot.value;
 const config=bytes(c,pins.program,382),vault=bytes(v,pins.program,16),record=bytes(b,pins.program,120),receipt=bytes(r,pins.program,32),rentData=bytes(rent,sysvarOwner,17);
 if(config.subarray(0,8).toString()!=='SCCFG001'||hash(config.subarray(0,358))!==pins.policySHA256||config[330]!==1||config[328]!==decimals||config[329]!==9)throw new Error('Native reserve policy differs from reviewed pins');
 if(vault.subarray(0,8).toString()!=='SCVLT002'||record.subarray(0,8).toString()!=='SCBST001'||record.subarray(8,40).toString('hex')!==w.inventorySHA256)throw new Error('Native vault or reviewed bootstrap record differs');
 const fields=['originSupplyUnits','totalNativeUnits','outsideNativeUnits','initialReserveNativeUnits'];
 for(let i=0;i<fields.length;i++)if(record.readBigUInt64LE(40+8*i)!==w[fields[i]])throw new Error('Bootstrap record differs from independently reviewed amounts');
 const sourceEvent=new PublicKey(record.subarray(72,104)),derivedReceipt=PublicKey.findProgramAddressSync([Buffer.from('claim'),configKey.toBuffer(),sourceEvent.toBuffer()],key(pins.program))[0].toBase58();
 if(sourceEvent.toBase58()==='11111111111111111111111111111111'||derivedReceipt!==w.receipt||!receipt.equals(sourceEvent.toBuffer())||record.readBigUInt64LE(104)!==w.originAmount||record.readBigUInt64LE(112)!==w.protectedNativeUnits)throw new Error('Bootstrap source event, consumed receipt or protected amount differs');
 const threshold=rentData.readDoubleLE(8),rate=rentData.readBigUInt64LE(0);
 if(!Number.isSafeInteger(threshold)||threshold<1||rate===0n||rentData[16]>100)throw new Error('Exact supported native reserve rent required');
 const minimumRent=144n*rate*BigInt(threshold);
 if(minimumRent>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Native reserve rent exceeds reviewed exact range');
 const floor=vault.readBigUInt64LE(8),outstanding=config.readBigUInt64LE(374),balance=v.lamports;
 if(floor!==w.protectedNativeUnits||floor<minimumRent||outstanding>w.originSupplyUnits||typeof balance!=='bigint')throw new Error('Native reserve floor, rent or obligations differ');
 const required=(w.originSupplyUnits-outstanding)*w.factor+floor;
 if(required>MAX||balance<required)throw new Error('Native vault cannot cover protected floor and remaining original-token capacity');
 return {originSupplyUnits:w.originSupplyUnits.toString(),nativeOutstandingOriginUnits:outstanding.toString(),reserveNativeUnits:balance.toString(),protectedFloorNativeUnits:floor.toString(),minimumVaultRentNativeUnits:minimumRent.toString(),remainingOriginCapacityNativeUnits:((w.originSupplyUnits-outstanding)*w.factor).toString(),minimumReconciledReserveNativeUnits:required.toString(),unallocatedNativeSurplusUnits:(balance-required).toString(),bootstrapSourceEvent:sourceEvent.toBase58(),bootstrapInventorySHA256:w.inventorySHA256,bootstrapOriginAmount:w.originAmount.toString(),snapshotSHA256:hash(Buffer.concat([config,vault,record,receipt,rentData,Buffer.from(balance.toString())]))};
}
export async function observeNativeReserve({rpc,pins,bootstrap,originDecimals,minimumContextSlot=0},fetcher=fetch){
 const url=endpoint(rpc);pins=normalizeProgramPins(pins);minimumContextSlot=slot(minimumContextSlot);const w=witness(bootstrap,originDecimals),decimals=originDecimals;
 if(pins.side!==1)throw new Error('Isolated native-side programme pins required');
 const config=PublicKey.findProgramAddressSync([Buffer.from('config'),key(pins.bridge).toBuffer()],key(pins.program))[0];
 const vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],key(pins.program))[0].toBase58(),record=PublicKey.findProgramAddressSync([Buffer.from('bootstrap'),config.toBuffer()],key(pins.program))[0].toBase58();
 const addresses=[config.toBase58(),vault,record,w.receipt,rentAddress];
 const before=await observePinnedProgram({rpc:url,pins,minimumContextSlot},fetcher);
 const first=await read(url,addresses,before.contextSlot,fetcher),a=decode(first,pins,w,decimals,config);
 const second=await read(url,addresses,first.context.slot,fetcher),b=decode(second,pins,w,decimals,config);
 if(a.snapshotSHA256!==b.snapshotSHA256)throw new Error('Native reserve changed between finalized reads; obtain a fresh observation');
 const after=await observePinnedProgram({rpc:url,pins,minimumContextSlot:second.context.slot},fetcher);
 if(after.outstandingUnits!==b.nativeOutstandingOriginUnits)throw new Error('Native obligations changed during final code observation');
 return {schemaVersion:1,state:'PINNED_NATIVE_RESERVE_SNAPSHOT',scope:'Stable private native-vault snapshot against a declared synthetic bootstrap witness; not complete genesis or original escrow proof',genesis:pins.genesis,program:pins.program,originMint:pins.originMint,vault,bootstrapRecord:record,bootstrapReceipt:w.receipt,originDecimals:decimals,...b,firstContextSlot:first.context.slot,contextSlot:second.context.slot,finalCodeContextSlot:after.contextSlot,assetSnapshots:2,codeObservations:4,consumedBootstrapReceiptVerified:true,protectedFloorVerified:true,recordedCapacityReconciled:true,originalEscrowVerified:false,completeGenesisBackingVerified:false,inventoryContentsVerified:false,pendingInventoryVerified:false,independentVerification:false,canRetry:false,canSign:false,canBroadcast:false,productionReady:false};
}
