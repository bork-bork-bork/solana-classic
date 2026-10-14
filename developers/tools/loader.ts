import { PublicKey, SystemProgram, TransactionInstruction, SYSVAR_RENT_PUBKEY, SYSVAR_CLOCK_PUBKEY } from '@solana/web3.js';
export const LOADER = new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const meta = (pubkey: PublicKey, isWritable = false, isSigner = false) => ({ pubkey, isWritable, isSigner });
export function integer32(value: number) { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; }
export function integer64(value: number) { if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('Exact nonnegative size required'); const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; }
export function programData(program: PublicKey) { return PublicKey.findProgramAddressSync([program.toBuffer()], LOADER)[0]; }
export function initializeBuffer(buffer: PublicKey, authority: PublicKey) { return new TransactionInstruction({ programId: LOADER, keys: [meta(buffer, true), meta(authority)], data: integer32(0) }); }
export function writeBuffer(buffer: PublicKey, authority: PublicKey, offset: number, bytes: Buffer) { if (bytes.length > 800)
    throw new Error('Loader chunk exceeds bound'); return new TransactionInstruction({ programId: LOADER, keys: [meta(buffer, true), meta(authority, false, true)], data: Buffer.concat([integer32(1), integer32(offset), integer64(bytes.length), bytes]) }); }
export function deployBuffer(payer: PublicKey, program: PublicKey, buffer: PublicKey, maxDataLen: number) { return new TransactionInstruction({ programId: LOADER, keys: [meta(payer, true, true), meta(programData(program), true), meta(program, true), meta(buffer, true), meta(SYSVAR_RENT_PUBKEY), meta(SYSVAR_CLOCK_PUBKEY), meta(SystemProgram.programId), meta(payer, false, true)], data: Buffer.concat([integer32(2), integer64(maxDataLen)]) }); }
export function upgradeBuffer(payer: PublicKey, program: PublicKey, buffer: PublicKey) { return new TransactionInstruction({ programId: LOADER, keys: [meta(programData(program), true), meta(program, true), meta(buffer, true), meta(payer, true), meta(SYSVAR_RENT_PUBKEY), meta(SYSVAR_CLOCK_PUBKEY), meta(payer, false, true)], data: integer32(3) }); }
