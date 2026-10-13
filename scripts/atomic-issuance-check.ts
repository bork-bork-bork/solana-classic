import { Keypair } from '@solana/web3.js';
import { prepareIssuance, finishIssuance, transferAsset, waitForSignature, currentNftOwner, type Issuance } from '@solana-classic/chain';
import type { AssetDocument } from '@solana-classic/config';
import { configuredApi, evidence, root } from './evidence.js';
import { privateJson, testKey, digest } from './workload.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const { api, facts, connection } = await configuredApi();
const file = privateJson(process.env.SC_QA_WALLETS_FILE ?? '.data/qa-wallets.json');
if (file.api !== api || file.genesis !== facts.expectedGenesisHash || !Array.isArray(file.wallets)) throw new Error('Only protected prefunded TEST actors are supported.');
const payer = testKey(file.wallets[0]); const recipient = testKey(file.wallets[1]).publicKey;
const post = async <T>(path: string, body: unknown): Promise<T> => { const r = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); if (!r.ok) throw new Error(path + ' rejected: ' + r.status); return r.json() as Promise<T>; };
const results: unknown[] = []; let serializedBytes = 0; const send = connection.sendRawTransaction.bind(connection);
connection.sendRawTransaction = (...args: Parameters<typeof send>) => { serializedBytes = args[0].length; return send(...args); };
try {
  for (const kind of ['meme', 'nft'] as const) {
    const mint = Keypair.generate(); const document = await post<AssetDocument>('/api/assets', { mint: mint.publicKey.toBase58(), kind, name: 'Atomic ' + kind, symbol: 'ATOM', presetId: 0 });
    const state: Issuance = { mint, document, preparationSignature: null, issuanceSignature: null }; const began = Date.now(); let confirmedMs = 0;
    await prepareIssuance(connection, facts.expectedGenesisHash!, payer, state, progress => { if (progress.phase === 'confirmed') confirmedMs = Date.now() - began; });
    if (!state.issuanceSignature || state.issuanceSignature !== state.preparationSignature) throw new Error('Atomic issuance requires one retained signature.');
    const issuanceBytes = serializedBytes;
    const signature = await finishIssuance(connection, facts.expectedGenesisHash!, payer, state);
    const retried = await finishIssuance(connection, facts.expectedGenesisHash!, payer, state);
    if (retried !== signature) throw new Error('Receipt retry changed the issuance.');
    await post('/api/gallery', { mint: document.mint, contentHash: document.contentHash, issuanceSignature: signature });
    const moved = await transferAsset(connection, facts.expectedGenesisHash!, payer, document, recipient.toBase58(), 1n); await waitForSignature(connection, moved, 'finalized');
    if (kind === 'nft' && await currentNftOwner(connection, document.mint) !== recipient.toBase58()) throw new Error('Transferred NFT owner mismatch.');
    results.push({ kind, mint: document.mint, signature, transferSignature: moved, confirmedMs, serializedBytes: issuanceBytes, sameReceiptRetry: true });
  }
  evidence('atomic-issuance-check', { at: new Date().toISOString(), scope: 'remote atomic SDK issuance and idempotent receipt retry; not bounded load acceptance', passed: true, api, genesis: facts.expectedGenesisHash, chainSourceSha256: digest(readFileSync(resolve(root, 'packages/chain/src/index.ts'))), results }); console.log(JSON.stringify({ passed: true, results }));
} catch (error) { evidence('atomic-issuance-check', { at: new Date().toISOString(), scope: 'remote atomic SDK issuance; incomplete or failed', passed: false, api, genesis: facts.expectedGenesisHash, results, error: error instanceof Error ? error.message : 'Atomic check failed.' }); throw error; }
