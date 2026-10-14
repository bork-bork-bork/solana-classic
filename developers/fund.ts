import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectDevnet } from './client';
import { key, privateJson, directory } from './tools/keys';
import { waitForSignature } from '@solana-classic/chain';
const payer = key('payer.json'), { connection, faucet } = await connectDevnet(), path = resolve(directory, 'funding.json');
if (process.argv.includes('--new-grant') && existsSync(path)) {
    const old = JSON.parse(readFileSync(path, 'utf8'));
    if (!old.finalized)
        throw new Error('Previous funding is uncertain; inspect the same request before starting another');
    writeFileSync(path, JSON.stringify({ requestId: crypto.randomUUID(), publicKey: payer.publicKey.toBase58(), previous: [...(old.previous ?? []), { requestId: old.requestId, signature: old.signature }] }) + '\n', { mode: 0o600 });
}
if (!existsSync(path))
    privateJson('funding.json', { requestId: crypto.randomUUID(), publicKey: payer.publicKey.toBase58() });
const state = JSON.parse(readFileSync(path, 'utf8'));
if (state.publicKey !== payer.publicKey.toBase58())
    throw new Error('Funding wallet changed');
const grant = await faucet(state.publicKey, state.requestId);
if (!grant.signature)
    throw new Error('Funding pending: rerun this command to inspect the same request.');
state.signature = grant.signature;
writeFileSync(path, JSON.stringify(state) + '\n', { mode: 0o600 });
await waitForSignature(connection, grant.signature, 'finalized');
state.finalized = true;
writeFileSync(path, JSON.stringify(state) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ publicKey: state.publicKey, signature: grant.signature, balanceLamports: await connection.getBalance(payer.publicKey, 'finalized'), hasMonetaryValue: false }, null, 2));
