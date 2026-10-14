import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import { connectDevnet } from '../client';
import { createKey, key, privateJson, directory } from '../tools/keys';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { submitInstructions, waitForSignature } from '@solana-classic/chain';
const programArg = process.argv[2];
if (!programArg)
    throw new Error('Pass your deployed program public key');
const program = new PublicKey(programArg), payer = key('payer.json'), { connection, network } = await connectDevnet();
const info = await connection.getAccountInfo(program, 'finalized');
if (!info?.executable)
    throw new Error('Program is not executable on this devnet');
const state = createKey('counter-' + program.toBase58() + '.json');
const instruction = (opcode: number, authority = payer.publicKey) => new TransactionInstruction({ programId: program, keys: [{ pubkey: state.publicKey, isWritable: true, isSigner: false }, { pubkey: authority, isWritable: false, isSigner: true }], data: Buffer.from([opcode]) });
let account = await connection.getAccountInfo(state.publicKey, 'finalized');
const receipts = [];
if (!account) {
    const rent = await connection.getMinimumBalanceForRentExemption(40);
    const signature = await submitInstructions(connection, network.expectedGenesisHash, payer, [SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: state.publicKey, space: 40, lamports: rent, programId: program }), instruction(0)], [state]);
    console.log(JSON.stringify({ step: 'initialize', signature }));
    await waitForSignature(connection, signature, 'finalized');
    receipts.push(signature);
    account = await connection.getAccountInfo(state.publicKey, 'finalized');
}
if (!account || !account.owner.equals(program) || account.data.length !== 40 || !account.data.subarray(0, 32).equals(payer.publicKey.toBuffer()))
    throw new Error('Counter owner or authority mismatch');
const before = account.data.readBigUInt64LE(32);
const signature = await submitInstructions(connection, network.expectedGenesisHash, payer, [instruction(1)]);
console.log(JSON.stringify({ step: 'increment', signature }));
await waitForSignature(connection, signature, 'finalized');
receipts.push(signature);
const after = await connection.getAccountInfo(state.publicKey, 'finalized');
if (!after || after.data.readBigUInt64LE(32) !== before + 1n)
    throw new Error('Finalized counter did not increment exactly once');
const attacker = Keypair.generate(), latest = await connection.getLatestBlockhash('confirmed'), negative = new Transaction({ feePayer: payer.publicKey, ...latest }).add(instruction(1, attacker.publicKey));
negative.sign(payer, attacker);
const simulation = await connection.simulateTransaction(negative);
if (!simulation.value.err)
    throw new Error('Wrong authority was accepted');
const unchanged = await connection.getAccountInfo(state.publicKey, 'finalized');
if (unchanged?.data.readBigUInt64LE(32) !== before + 1n)
    throw new Error('Negative simulation changed the counter');
console.log(JSON.stringify({ passed: true, program: program.toBase58(), state: state.publicKey.toBase58(), authority: payer.publicKey.toBase58(), before: String(before), after: String(before + 1n), wrongAuthorityRejected: true, negativeWasSimulationOnly: true, receipts, hasMonetaryValue: false }, null, 2));
