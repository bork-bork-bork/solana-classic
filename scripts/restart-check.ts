import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { verifyAsset, currentNftOwner, waitForSignature } from '@solana-classic/chain';
import type { GalleryEntry, FaucetReceipt } from '@solana-classic/config';
import { configuredApi, evidence } from './evidence.js';

const expectedApi = 'https://network-release-production.up.railway.app';
const provider = { project: '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe', service: 'd0a1de40-bd9c-47eb-a7fc-477f1c55b2d6', environment: '3367b373-2332-4702-8cce-c12b8f03949e' };
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const { api, facts, connection } = await configuredApi();
if (api !== expectedApi || facts.mode !== 'remote') throw new Error('Restart drill is restricted to the designated Railway TEST service.');
const wallet = Keypair.generate().publicKey.toBase58(); // No secret is retained: a valueless continuity canary.
const requestId = randomUUID();
async function grant() {
  const response = await fetch(api + '/api/faucet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey: wallet, requestId }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Continuity faucet request rejected: ' + response.status);
  return response.json() as Promise<FaucetReceipt>;
}
async function snapshot(entries: GalleryEntry[]) {
  const balances: Record<string, number> = { [wallet]: await connection.getBalance(new PublicKey(wallet), 'finalized') };
  const assets = [];
  for (const entry of entries) {
    await verifyAsset(connection, entry);
    const account = await connection.getAccountInfo(new PublicKey(entry.mint), 'finalized');
    if (!account) throw new Error('Known mint disappeared.');
    const hashes: Record<string, string> = {};
    for (const uri of [entry.uri, entry.image]) {
      if (!uri.startsWith(api + '/assets/')) throw new Error('Unexpected immutable asset origin.');
      const response = await fetch(uri, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('Immutable asset missing.');
      hashes[uri] = sha(new Uint8Array(await response.arrayBuffer()));
    }
    const response = await fetch(api + '/api/gallery/' + entry.mint, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Persisted gallery entry missing.');
    const registered = await response.json() as GalleryEntry;
    if (registered.contentHash !== entry.contentHash || registered.issuanceSignature !== entry.issuanceSignature || registered.verifiedAt !== entry.verifiedAt) throw new Error('Gallery record changed.');
    const owner = entry.kind === 'nft' ? await currentNftOwner(connection, entry.mint) : null;
    assets.push({ mint: entry.mint, accountHash: sha(account.data), hashes, owner, verifiedAt: registered.verifiedAt });
  }
  return { genesis: await connection.getGenesisHash(), balances, assets };
}
let baseline: Awaited<ReturnType<typeof snapshot>> | null = null;
let restartResult: string | null = null;
try {
  const entries = (await fetch(api + '/api/gallery?limit=50').then(r => { if (!r.ok) throw new Error('Gallery unavailable.'); return r.json() as Promise<{ entries: GalleryEntry[] }>; })).entries;
  if (!entries.some(e => e.kind === 'nft') || !entries.some(e => e.kind === 'meme')) throw new Error('Both issued asset types are required for persistence proof.');
  const initial = await grant();
  if (!initial.signature) throw new Error('Canary funding is uncertain; do not request a new grant.');
  await waitForSignature(connection, initial.signature, 'finalized');
  baseline = await snapshot(entries);
  evidence('restart-baseline', { at: new Date().toISOString(), scope: 'remote pre-restart baseline only', passed: false, api, provider, wallet, requestId, receipt: initial, baseline });
  console.log('Captured real balances, immutable mint bytes, ownership, asset hashes and gallery records. Restarting the designated TEST service.');
  const result = await promisify(execFile)(process.env.SC_RAILWAY_CLI ?? '/opt/homebrew/bin/railway', ['restart', '--project', provider.project, '--service', provider.service, '--environment', provider.environment, '--yes', '--json'], { timeout: 60_000, maxBuffer: 64_000 });
  restartResult = result.stdout.trim();
  const started = Date.now(); let ready = false;
  while (Date.now() - started < 600_000) {
    try {
      const response = await fetch(api + '/healthz', { signal: AbortSignal.timeout(5_000) });
      if (response.ok && Date.now() - started > 60_000) { await configuredApi(); ready = true; break; }
    } catch { /* The expected maintenance outage is recorded by elapsed time, not called a pass. */ }
    await delay(3_000);
  }
  if (!ready) throw new Error('Restart readiness timed out.');
  const after = await snapshot(entries);
  if (JSON.stringify(after) !== JSON.stringify(baseline)) throw new Error('Persistent chain or asset/database state changed during restart.');
  const repeated = await grant();
  if (repeated.signature !== initial.signature || repeated.requestId !== initial.requestId || repeated.lamports !== initial.lamports) throw new Error('Persisted faucet UUID did not return the original grant.');
  if (await connection.getBalance(new PublicKey(wallet), 'finalized') !== baseline.balances[wallet]) throw new Error('Repeated faucet UUID created another payment.');
  evidence('restart-check', { at: new Date().toISOString(), scope: 'remote provider container/process restart; not host reboot or backup restore', passed: true, api, genesis: facts.expectedGenesisHash, provider, restartResult, durationMs: Date.now() - started, wallet, requestId, signature: initial.signature, baseline, after });
  console.log('Verified same genesis, exact canary balance, mint/supply/authorities, NFT ownership, immutable assets, gallery database and idempotent faucet receipt after provider restart.');
} catch (error) {
  evidence('restart-check', { at: new Date().toISOString(), scope: 'remote provider container/process restart', passed: false, api, genesis: facts.expectedGenesisHash, provider, wallet, requestId, baseline, restartResult, error: error instanceof Error ? error.message : 'Restart drill failed.' });
  throw error;
}
