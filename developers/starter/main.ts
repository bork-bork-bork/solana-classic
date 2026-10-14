import './style.css';
import { Buffer } from 'buffer';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';
import network from '../network.json';
const connection = new Connection(network.rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });
let payer: Keypair | null = null, state: Keypair | null = null, program: PublicKey | null = null, fundingId: string | null = null, busy = false, pending: string | null = null, admitted = false;
const el = (id: string) => document.getElementById(id)!;
const status = (message: string, error = false) => { el('status').textContent = message; el('status').dataset.error = String(error); };
function buttons() { (el('program') as HTMLInputElement).disabled = busy || !!state; (el('resume') as HTMLButtonElement).disabled = busy || !pending; (el('create') as HTMLButtonElement).disabled = busy || !!payer; (el('fund') as HTMLButtonElement).disabled = busy || !payer || !admitted; (el('initialize') as HTMLButtonElement).disabled = busy || !payer || !admitted || !!state || !!pending; (el('increment') as HTMLButtonElement).disabled = busy || !payer || !state || !admitted || !!pending; }
async function verify() { if (await connection.getGenesisHash() !== network.expectedGenesisHash)
    throw new Error('Wrong chain. Signing is disabled.'); }
async function finalized(signature: string) { const started = Date.now(); while (Date.now() - started < 60000) {
    const result = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (result?.err)
        throw new Error('Transaction failed: ' + JSON.stringify(result.err));
    if (result?.confirmationStatus === 'finalized')
        return;
    await new Promise(r => setTimeout(r, 1200));
} throw new Error('Finalization remains uncertain. Check the recorded receipt before retrying.'); }
function receipt(signature: string) { el('receipt').replaceChildren(); const link = document.createElement('a'); link.href = network.explorer + '/tx/' + signature; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Transaction receipt: ' + signature; el('receipt').append(link); }
async function send(instructions: TransactionInstruction[], extra: Keypair[] = []) {
    if (!payer || pending)
        throw new Error('No session, or an unresolved transaction already exists.');
    await verify();
    const latest = await connection.getLatestBlockhash('confirmed'), tx = new Transaction({ feePayer: payer.publicKey, ...latest }).add(...instructions), signed = new VersionedTransaction(tx.compileMessage());
    signed.sign([payer, ...extra]);
    const bytes = signed.serialize();
    if (bytes.length > 1232)
        throw new Error('Transaction exceeds size limit');
    const simulation = await connection.simulateTransaction(signed, { sigVerify: true, commitment: 'confirmed' });
    if (simulation.value.err)
        throw new Error('Simulation rejected this action: ' + JSON.stringify(simulation.value.err));
    await verify();
    // Retain the signed receipt before broadcast. A timeout never permits a fresh second operation.
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let number = 0n;
    for (const b of signed.signatures[0]!)
        number = number * 256n + BigInt(b);
    let signature = '';
    while (number) {
        signature = alphabet[Number(number % 58n)] + signature;
        number /= 58n;
    }
    for (const b of signed.signatures[0]!) {
        if (b)
            break;
        signature = '1' + signature;
    }
    pending = signature;
    receipt(signature);
    const actual = await connection.sendRawTransaction(bytes, { skipPreflight: false, maxRetries: 2 });
    if (actual !== signature)
        throw new Error('Returned receipt mismatch');
    await finalized(signature);
    pending = null;
    return signature;
}
async function act(fn: () => Promise<void>) { if (busy)
    return; busy = true; buttons(); try {
    await fn();
}
catch (e) {
    status(e instanceof Error ? e.message : 'Action failed', true);
}
finally {
    busy = false;
    buttons();
} }
const instruction = (op: number) => new TransactionInstruction({ programId: program!, keys: [{ pubkey: state!.publicKey, isWritable: true, isSigner: false }, { pubkey: payer!.publicKey, isWritable: false, isSigner: true }], data: Buffer.from([op]) });
el('create').onclick = () => { payer = Keypair.generate(); el('wallet').textContent = payer.publicKey.toBase58(); status('Test wallet created. Get tSOC before creating a counter.'); buttons(); };
el('fund').onclick = () => act(async () => { await verify(); fundingId ??= crypto.randomUUID(); const response = await fetch(network.apiBase + '/api/faucet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey: payer!.publicKey.toBase58(), requestId: fundingId }) }); const grant = await response.json(); if (!response.ok || !grant.signature)
    throw new Error(grant.error?.message ?? 'Funding is pending. Retry checks the same request.'); receipt(grant.signature); await finalized(grant.signature); fundingId = null; status('Test funds received. Ready to call your program.'); });
el('initialize').onclick = () => act(async () => { await verify(); program = new PublicKey((el('program') as HTMLInputElement).value.trim()); const account = await connection.getAccountInfo(program, 'finalized'); if (!account?.executable)
    throw new Error('No executable program at that address'); state = Keypair.generate(); try {
    const rent = await connection.getMinimumBalanceForRentExemption(40);
    await send([SystemProgram.createAccount({ fromPubkey: payer!.publicKey, newAccountPubkey: state.publicKey, space: 40, lamports: rent, programId: program }), instruction(0)], [state]);
}
catch (e) {
    if (!pending)
        state = null;
    throw e;
} await read(); status('Counter created and finalized.'); });
async function read() { const account = await connection.getAccountInfo(state!.publicKey, 'finalized'); if (!account || !account.owner.equals(program!) || account.data.length !== 40 || !account.data.subarray(0, 32).equals(payer!.publicKey.toBuffer()))
    throw new Error('State owner/authority mismatch'); el('state').textContent = 'State: ' + state!.publicKey.toBase58(); el('count').textContent = 'Counter: ' + account.data.readBigUInt64LE(32).toString(); }
el('increment').onclick = () => act(async () => { await send([instruction(1)]); await read(); status('Counter incremented and finalized.'); });
el('resume').onclick = () => act(async () => { await verify(); if (!pending)
    throw new Error('No pending receipt'); await finalized(pending); pending = null; await read(); status('Receipt finalized. Counter reread from the chain.'); });
void act(async () => { await verify(); admitted = true; status('Devnet is live. Connected to the verified Classic network.'); });
