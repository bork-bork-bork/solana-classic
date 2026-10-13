import { readFileSync, copyFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PublicKey } from '@solana/web3.js';
import { verifyAsset, currentNftOwner } from '@solana-classic/chain';
import type { GalleryEntry, FaucetReceipt } from '@solana-classic/config';
import { configuredApi, evidence, root } from './evidence.js';
import { digest, readFreeze, observeFrozen, pause } from './workload.js';

// Reconfirm the final executable build without replacing the original cold
// recovery baseline or requesting another faucet payment.
const { api, facts, connection } = await configuredApi();
const freeze = readFreeze(api, facts.expectedGenesisHash!);
const bytes = readFileSync(root + '/evidence/restart-baseline.json');
const baseline = JSON.parse(bytes.toString()) as {
  api: string; wallet: string; requestId: string; receipt: FaucetReceipt;
  baseline: { genesis: string; balances: Record<string, number>; assets: { mint: string; accountHash: string; hashes: Record<string, string>; owner: string | null; verifiedAt: string }[] };
};
if (api !== 'https://network-release-production.up.railway.app' || baseline.api !== api || baseline.baseline.genesis !== freeze.genesis || baseline.baseline.assets.length > 50) throw new Error('Designated experimental baseline required.');
const provider = { project: '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe', service: 'd0a1de40-bd9c-47eb-a7fc-477f1c55b2d6', environment: '3367b373-2332-4702-8cce-c12b8f03949e' };
async function snapshot() {
  const balances: Record<string, number> = {}; const assets = [];
  for (const [address, expected] of Object.entries(baseline.baseline.balances)) {
    const balance = await connection.getBalance(new PublicKey(address), 'finalized');
    if (balance !== expected) throw new Error('Canary balance changed.'); balances[address] = balance;
  }
  for (const saved of baseline.baseline.assets) {
    const response = await fetch(api + '/api/gallery/' + saved.mint, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Persisted gallery row missing.');
    const entry = await response.json() as GalleryEntry;
    if (entry.verifiedAt !== saved.verifiedAt) throw new Error('Gallery timestamp changed.');
    await verifyAsset(connection, entry);
    const account = await connection.getAccountInfo(new PublicKey(saved.mint), 'finalized');
    if (!account || digest(account.data) !== saved.accountHash) throw new Error('Mint bytes changed.');
    for (const [url, checksum] of Object.entries(saved.hashes)) {
      if (new URL(url).origin !== api || !new URL(url).pathname.startsWith('/assets/')) throw new Error('Unexpected asset origin.');
      const file = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!file.ok || digest(new Uint8Array(await file.arrayBuffer())) !== checksum) throw new Error('Immutable file changed.');
    }
    const owner = saved.owner ? await currentNftOwner(connection, saved.mint) : null;
    if (owner !== saved.owner) throw new Error('NFT owner changed.');
    assets.push({ mint: saved.mint, accountHash: saved.accountHash, owner, verifiedAt: saved.verifiedAt });
  }
  const replay = await fetch(api + '/api/faucet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicKey: baseline.wallet, requestId: baseline.requestId }), signal: AbortSignal.timeout(15_000) });
  if (!replay.ok) throw new Error('Original UUID replay unavailable.');
  const receipt = await replay.json() as FaucetReceipt;
  if (receipt.signature !== baseline.receipt.signature || receipt.lamports !== baseline.receipt.lamports || receipt.requestId !== baseline.requestId || await connection.getBalance(new PublicKey(baseline.wallet), 'finalized') !== baseline.receipt.lamports) throw new Error('UUID replay changed original payment.');
  return { balances, assets, receipt };
}
await observeFrozen(freeze);
const before = await snapshot(); const startedAt = new Date().toISOString();
if (!existsSync(root + '/evidence/restart-check-initial.json')) copyFileSync(root + '/evidence/restart-check.json', root + '/evidence/restart-check-initial.json');
let providerResult = ''; let runtimeAfter: Record<string, unknown> | null = null;
try {
  const result = await promisify(execFile)('/opt/homebrew/bin/railway', ['restart', '--project', provider.project, '--service', provider.service, '--environment', provider.environment, '--yes', '--json'], { timeout: 60_000, maxBuffer: 64_000 });
  providerResult = result.stdout.trim();
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    try {
      const health = await fetch(api + '/healthz', { signal: AbortSignal.timeout(5_000) });
      if (health.ok) {
        const response = await fetch(api + '/api/runtime', { signal: AbortSignal.timeout(10_000) });
        if (response.ok) {
          const observed = await response.json() as Record<string, unknown>;
          if (observed.apiBootId !== freeze.runtime.apiBootId && observed.validatorBootId !== freeze.runtime.validatorBootId) { runtimeAfter = observed; break; }
        }
      }
    } catch { /* Expected maintenance outage. */ }
    await pause(3_000);
  }
  if (!runtimeAfter || ['genesis', 'sourceCommit', 'coreSha256', 'agaveVersion', 'tokenProgramVersion', 'tokenProgramSha256'].some(key => runtimeAfter![key] !== freeze.runtime[key])) throw new Error('Restart did not return the same executable identity with new process boots.');
  await configuredApi(); const after = await snapshot();
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('State changed across final-build restart.');
  evidence('restart-check', { at: new Date().toISOString(), startedAt, scope: 'remote actual final-build provider container/process restart and persistence reconfirmation; not hardware host reboot or backup restore', passed: true, api, genesis: freeze.genesis, candidate: freeze.candidate, provider, providerResult, runtimeBefore: freeze.runtime, runtimeAfter, baselineSha256: digest(bytes), before, after, noNewGrant: true });
  console.log('Final-build restart passed with new API/validator boot IDs and unchanged recorded state.');
} catch (error) {
  evidence('restart-check', { at: new Date().toISOString(), startedAt, scope: 'remote final-build provider process restart reconfirmation', passed: false, api, genesis: freeze.genesis, candidate: freeze.candidate, provider, providerResult, runtimeAfter, error: error instanceof Error ? error.message : 'Restart failed.' });
  throw error;
}
