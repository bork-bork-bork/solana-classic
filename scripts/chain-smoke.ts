import { Keypair } from '@solana/web3.js';
import { prepareIssuance, finishIssuance, transferNative, transferAsset, waitForSignature, currentNftOwner, type Issuance } from '@solana-classic/chain';
import type { AssetDocument, FaucetReceipt } from '@solana-classic/config';
import { configuredApi, evidence } from './evidence.js';
const { api, facts, connection } = await configuredApi();
const expected = facts.expectedGenesisHash!;
const post = async <T>(path: string, body: unknown): Promise<T> => { const response = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); if (!response.ok) throw new Error(`API ${path} rejected with status ${response.status}.`); return response.json() as Promise<T>; };
const payer = Keypair.generate(); const recipient = Keypair.generate(); const receipts: { action: string; signature: string; mint?: string }[] = [];
try {
for (const wallet of [payer, recipient]) {
  const requestId = crypto.randomUUID(); const grant = await post<FaucetReceipt>('/api/faucet', { publicKey: wallet.publicKey.toBase58(), requestId });
  if (!grant.signature) throw new Error('Faucet grant is pending/uncertain; no automatic second grant.');
  await waitForSignature(connection, grant.signature, 'confirmed'); receipts.push({ action: 'test_funding', signature: grant.signature });
}
const recipientBefore = await connection.getBalance(recipient.publicKey, 'confirmed');
const native = await transferNative(connection, expected, payer, recipient.publicKey.toBase58(), 10_000_000); receipts.push({ action: 'native_transfer', signature: native });
if ((await connection.getBalance(recipient.publicKey, 'confirmed')) !== recipientBefore + 10_000_000) throw new Error('Native recipient balance did not increase by the exact transfer amount.');
for (const kind of ['meme', 'nft'] as const) {
  const mint = Keypair.generate(); const document = await post<AssetDocument>('/api/assets', { mint: mint.publicKey.toBase58(), kind, name: 'Smoke ' + kind, symbol: kind === 'nft' ? 'ART' : 'MEME', presetId: kind === 'nft' ? 0 : 2 });
  for (const url of [document.uri, document.image]) if (!(await fetch(url)).ok) throw new Error('Immutable metadata unavailable.');
  const state: Issuance = { mint, document, preparationSignature: null, issuanceSignature: null };
  await prepareIssuance(connection, expected, payer, state); const signature = await finishIssuance(connection, expected, payer, state);
  await post('/api/gallery', { mint: document.mint, contentHash: document.contentHash, issuanceSignature: signature }); receipts.push({ action: kind + '_issuance', signature, mint: document.mint });
  const moved = await transferAsset(connection, expected, payer, document, recipient.publicKey.toBase58(), 1n); await waitForSignature(connection, moved, 'finalized'); receipts.push({ action: kind + '_transfer', signature: moved, mint: document.mint });
  if (kind === 'nft' && await currentNftOwner(connection, document.mint) !== recipient.publicKey.toBase58()) throw new Error('NFT ownership did not transfer.');
}
evidence('chain-smoke-' + facts.mode, { at: new Date().toISOString(), scope: facts.mode, api, genesis: expected, passed: true, publicKeys: [payer.publicKey.toBase58(), recipient.publicKey.toBase58()], receipts });
console.log(`Verified ${receipts.length} actual ${facts.mode} test-network actions. No private keys were saved.`);
} catch (error) {
  evidence('chain-smoke-' + facts.mode, { at: new Date().toISOString(), scope: facts.mode, api, genesis: expected, passed: false, publicKeys: [payer.publicKey.toBase58(), recipient.publicKey.toBase58()], receipts, error: error instanceof Error ? error.message : 'Chain proof failed.', diagnostic: error instanceof Error ? error.cause : null });
  throw error;
}
