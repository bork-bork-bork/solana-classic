// Exact private-copy byte comparison after a deliberately incompatible upgrade.
// Evidence helper only: it neither approves replacement code nor signs a claim.
import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {normalizeProgramPins} from './program-pins.mjs';
const LOADER='BPFLoaderUpgradeab1e11111111111111111111111',MAX=1048576;
const hash=b=>createHash('sha256').update(b).digest('hex');
function bytes(snapshot,minimum=0){
 if(!Number.isSafeInteger(snapshot?.context?.slot)||snapshot.context.slot<minimum)throw Error('Finalized replacement context missing or regressing');
 const a=snapshot.value;if(!a||a.owner!==LOADER||a.executable!==false||!Number.isSafeInteger(a.lamports)||a.lamports<1||!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string'||a.data[0].length>Math.ceil(MAX/3)*4)throw Error('Replacement ProgramData owner/layout differs');
 const b=Buffer.from(a.data[0],'base64');if(b.length>MAX||b.length<49||b.toString('base64')!==a.data[0]||b.readUInt32LE()!==3||![0,1].includes(b[12]))throw Error('Canonical ProgramData required');return b;
}
export function verifyPrivateCodeReplacement({pins,replacementSHA256,replacementBytes,before,after}){
 pins=normalizeProgramPins(pins);
 if(typeof replacementSHA256!=='string'||! /^[0-9a-f]{64}$/.test(replacementSHA256)||replacementSHA256===pins.elfSHA256||!Number.isSafeInteger(replacementBytes)||replacementBytes<4||replacementBytes>MAX-45)throw Error('Different reviewed replacement artifact required');
 const old=bytes(before),current=bytes(after,before.context.slot);
 if(hash(old)!==pins.programDataSHA256||old.length<45+pins.elfBytes||hash(old.subarray(45,45+pins.elfBytes))!==pins.elfSHA256||old.subarray(45+pins.elfBytes).some(v=>v!==0))throw Error('Previous code does not match selected pins');
 if(pins.upgradeAuthority===null||old[12]!==1||!old.subarray(13,45).equals(new PublicKey(pins.upgradeAuthority).toBuffer()))throw Error('Selected private upgrade authority differs');
 const oldSlot=old.readBigUInt64LE(4),newSlot=current.readBigUInt64LE(4);
 if(current.length!==old.length||after.value.lamports!==before.value.lamports||!current.subarray(12,45).equals(old.subarray(12,45))||newSlot<=oldSlot||newSlot>BigInt(after.context.slot))throw Error('Replacement capacity, rent, authority or deployment slot differs');
 if(current.length<45+replacementBytes||current.subarray(45,49).toString('hex')!=='7f454c46'||hash(current.subarray(45,45+replacementBytes))!==replacementSHA256||current.subarray(45+replacementBytes).some(v=>v!==0))throw Error('Replacement ELF or unused capacity differs');
 return {schemaVersion:1,state:'PRIVATE_CODE_REPLACEMENT_VERIFIED',program:pins.program,genesis:pins.genesis,oldElfSHA256:pins.elfSHA256,newElfSHA256:replacementSHA256,newElfBytes:replacementBytes,oldProgramDataSHA256:hash(old),newProgramDataSHA256:hash(current),oldDeploymentSlot:String(oldSlot),newDeploymentSlot:String(newSlot),contextSlot:after.context.slot,upgradeAuthority:pins.upgradeAuthority,authorityUnchanged:true,capacityUnchanged:true,productionReady:false,replacementApprovedForSettlement:false,canSign:false,canBroadcast:false};
}
