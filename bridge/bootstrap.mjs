// Unsigned, isolated-rehearsal-only bootstrap preparation. No RPC, keys,
// signing, deployment, or monetary release. Independent review is required.
import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { auditBootstrap } from '../mainnet/bootstrap.mjs';
import { encodeEvent, validateEvent, PUBLIC_GENESIS } from './sdk.mjs';
export const VAULT_V2_BYTES=16;
export const BOOTSTRAP_RECORD_BYTES=120;
const key=v=>new PublicKey(v);
const loader=key('BPFLoaderUpgradeab1e11111111111111111111111');
const system=key('11111111111111111111111111111111');
const blocked=new Set([...PUBLIC_GENESIS,'7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon']);
const integer=v=>{if(typeof v!=='bigint'||v<0n||v>(1n<<64n)-1n)throw new Error('Exact u64 BigInt required');const b=Buffer.alloc(8);b.writeBigUInt64LE(v);return b;};
export function bootstrapInstruction({event,expected,payer,committee,accountingInput}) {
  validateEvent(event,expected);
  if(event.direction!==0||event.epoch!==1n||blocked.has(event.sourceChain)||blocked.has(event.destinationChain))throw new Error('A fresh isolated epoch-one source lock is required');
  if(!Array.isArray(committee)||committee.length!==3||new Set(committee.map(k=>key(k).toBase58())).size!==3||committee.some(k=>key(k).equals(key(payer))))throw new Error('Three distinct co-signers and a separate upgrade authority are required');
  const program=key(event.destinationProgram);
  const config=PublicKey.findProgramAddressSync([Buffer.from('config'),key(event.bridge).toBuffer()],program)[0];
  const vault=PublicKey.findProgramAddressSync([Buffer.from('vault'),config.toBuffer()],program)[0];
  if(event.recipient!==vault.toBase58()||accountingInput.reserveAddress!==vault.toBase58()||accountingInput.genesisAudit?.genesis!==event.destinationChain||accountingInput.reserveDataBytes!==VAULT_V2_BYTES)throw new Error('Inventory must pin this native vault, V2 size and destination genesis');
  const report=auditBootstrap(accountingInput);
  if(!report.gates.declaredCountersMatch||BigInt(report.backing.declaredPrelockedOriginUnits)!==event.originAmount)throw new Error('Both declared counters and source lock must match exact initial backing');
  const receipt=PublicKey.findProgramAddressSync([Buffer.from('claim'),config.toBuffer(),key(event.sourceEvent).toBuffer()],program)[0];
  const record=PublicKey.findProgramAddressSync([Buffer.from('bootstrap'),config.toBuffer()],program)[0];
  const programData=PublicKey.findProgramAddressSync([program.toBuffer()],loader)[0];
  const witness=Buffer.concat([Buffer.from(report.inventorySHA256,'hex'),
    ...[report.totals.originalSupplyUnits,report.totals.nativeGenesisUnits,report.totals.nativeOutsideReserveUnits,report.totals.reserveNativeUnits].map(v=>integer(BigInt(v)))]);
  const writable=pubkey=>({pubkey,isWritable:true,isSigner:false}),readonly=pubkey=>({pubkey,isWritable:false,isSigner:false});
  const instruction=new TransactionInstruction({programId:program,
    keys:[{pubkey:key(payer),isWritable:true,isSigner:true},writable(config),writable(vault),writable(receipt),writable(record),readonly(system),readonly(program),readonly(programData),...committee.map(k=>({pubkey:key(k),isWritable:false,isSigner:true}))],
    data:Buffer.concat([Buffer.from([4]),encodeEvent(event),witness])});
  return {instruction,accounting:report,state:'UNSIGNED_ISOLATED_BOOTSTRAP',productionReady:false,activationEnabled:false};
}

export function decodeBootstrapRecord(bytes) {
  const b=Buffer.from(bytes);
  if(b.length!==BOOTSTRAP_RECORD_BYTES||b.subarray(0,8).toString()!=='SCBST001')throw new Error('Unknown bootstrap record');
  return {inventorySHA256:b.subarray(8,40).toString('hex'),originSupply:b.readBigUInt64LE(40),totalNative:b.readBigUInt64LE(48),outsideNative:b.readBigUInt64LE(56),reserveNative:b.readBigUInt64LE(64),sourceEvent:key(b.subarray(72,104)).toBase58(),originAmount:b.readBigUInt64LE(104),protectedNative:b.readBigUInt64LE(112)};
}
