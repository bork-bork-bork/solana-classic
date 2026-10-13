import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Connection, PublicKey } from '@solana/web3.js';
import { assertNetwork, currentNftOwner, verifyAsset } from '@solana-classic/chain';
import { assetInputSchema, type FaucetReceipt, type GalleryEntry, type NetworkFacts } from '@solana-classic/config';
import { evidence, root } from './evidence.js';

// This verifies an operator-created isolated restore. It never creates backups,
// changes Railway configuration, resets a ledger or sends a new faucet UUID.
const liveApi = 'https://network-release-production.up.railway.app';
const source = {
  projectId: '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe',
  environmentId: '3367b373-2332-4702-8cce-c12b8f03949e',
  serviceId: 'd0a1de40-bd9c-47eb-a7fc-477f1c55b2d6',
  volumeId: '080bf785-50e7-4dda-893b-4d613aa5e9a8',
  volumeInstanceId: 'c639b73d-bb8e-46b2-b94e-4327561e5274',
};
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const shaPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const checkInputsOnly = process.argv.includes('--check-inputs');
const rowKeys = ['mint', 'kind', 'name', 'symbol', 'presetId', 'contentHash', 'uri', 'image', 'issuanceSignature', 'verifiedAt'] as const;
type AssetBaseline = { mint: string; accountHash: string; hashes: Record<string, string>; owner: string | null; verifiedAt: string };
type Baseline = {
  at: string; api: string; provider: { project: string; service: string; environment: string };
  wallet: string; requestId: string; receipt: FaucetReceipt;
  baseline: { genesis: string; balances: Record<string, number>; assets: AssetBaseline[] };
};
type ProviderEvidence = {
  schemaVersion: 1; provider: 'railway'; scope: 'remote cold backup and isolated restore';
  reviewed: true; reviewedAt: string; reviewer: string; method: 'railway-volume-backup' | 'cold-archive';
  source: typeof source;
  target: { projectId: string; environmentId: string; serviceId: string; volumeId: string; api: string; mountPath: '/data'; deploymentId: string };
  backup: { id: string; state: 'complete'; writersStoppedAt: string; startedAt: string; completedAt: string; writersResumedAt: string; archiveSha256?: string };
  restore: { startedAt: string; completedAt: string; readyAt: string; state: 'complete'; isolated: true; originalVolumeRetained: true; liveRestoreApplied: false; targetContainsOnlyCopiedSourceData: true };
  baselineSha256: string; sourceGalleryRows: GalleryEntry[]; sourceFaucetReceipt: FaucetReceipt;
  proofs: { path: string; sha256: string }[];
};
function publicFile(path: string, evidenceOnly = true) {
  assert(!path.includes('\\') && !path.split('/').includes('..') && !path.startsWith('/'), 'Evidence paths must be repository-relative.');
  if (evidenceOnly) assert(path.startsWith('evidence/') && path.endsWith('.json'), 'Provider proofs must be public evidence JSON.');
  const absolute = resolve(root, path); const stat = lstatSync(absolute);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 1_048_576, 'Evidence must be a bounded ordinary file.');
  return readFileSync(absolute);
}
function origin(input: string) {
  const url = new URL(input);
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' && !url.port, 'A bare public HTTPS API origin is required.');
  assert(url.hostname.endsWith('.up.railway.app'), 'Restore API must be a distinct Railway HTTPS ingress.');
  return url.origin;
}
function time(value: string, label: string) {
  assert(typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(value) && Number.isFinite(Date.parse(value)), label + ' requires a recorded UTC timestamp.');
  assert(Date.parse(value) <= Date.now() + 60_000, label + ' cannot be in the future.');
  return Date.parse(value);
}
function registeredRow(row: GalleryEntry) {
  assetInputSchema.parse(Object.fromEntries(['mint', 'kind', 'name', 'symbol', 'presetId'].map(key => [key, row[key as keyof GalleryEntry]])));
  assert(shaPattern.test(row.contentHash) && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(row.issuanceSignature), 'Gallery hash/signature invalid.');
  time(row.verifiedAt, 'Gallery verifiedAt');
  for (const uri of [row.uri, row.image]) {
    const url = new URL(uri);
    assert(url.origin === liveApi && !url.search && !url.hash && new RegExp('^/assets/' + row.contentHash + '/(metadata\\.json|image\\.svg)$').test(url.pathname), 'Stored immutable URLs must retain the original live origin/content hash.');
  }
  return Object.fromEntries(rowKeys.map(key => [key, row[key]]));
}
function matchingReceipt(receipt: FaucetReceipt, baseline: Baseline) {
  assert(receipt.requestId === baseline.requestId && receipt.signature === baseline.receipt.signature && receipt.lamports === baseline.receipt.lamports, 'The original faucet UUID, signature and amount must be retained.');
  assert(receipt.state === 'confirmed' || receipt.state === 'submitted', 'Original faucet receipt must have a recorded successful submission.');
}
function inputs() {
  const canonicalBytes = publicFile('config/network.remote.json', false);
  const canonical = JSON.parse(canonicalBytes.toString()) as NetworkFacts;
  assert(canonical.mode === 'remote' && canonical.hasMonetaryValue === false && canonical.denomination === 'TEST' && canonical.expectedGenesisHash, 'Independent canonical remote TEST configuration is required.');
  const baselineBytes = publicFile('evidence/restart-baseline.json');
  const baseline = JSON.parse(baselineBytes.toString()) as Baseline;
  assert(baseline.api === liveApi && baseline.baseline.genesis === canonical.expectedGenesisHash, 'Baseline must bind to the canonical live TEST chain.');
  assert(baseline.provider.project === source.projectId && baseline.provider.service === source.serviceId && baseline.provider.environment === source.environmentId, 'Baseline source identity mismatch.');
  new PublicKey(baseline.wallet);
  assert(uuidPattern.test(baseline.requestId) && baseline.receipt.signature && baseline.receipt.lamports === 1_000_000_000, 'An existing 1 TEST canary grant is required; never generate a replacement UUID.');
  matchingReceipt(baseline.receipt, baseline);
  assert(Object.keys(baseline.baseline.balances).length > 0 && baseline.baseline.balances[baseline.wallet] === baseline.receipt.lamports, 'Baseline canary balance missing.');
  for (const [address, amount] of Object.entries(baseline.baseline.balances)) { new PublicKey(address); assert(Number.isSafeInteger(amount) && amount >= 0, 'Invalid baseline balance.'); }
  assert(Array.isArray(baseline.baseline.assets) && baseline.baseline.assets.length >= 2, 'Known NFT and meme mint snapshots are required.');
  const providerPath = process.env.SC_RECOVERY_PROVIDER_EVIDENCE ?? 'evidence/recovery-provider.json';
  const providerBytes = publicFile(providerPath);
  const provider = JSON.parse(providerBytes.toString()) as ProviderEvidence;
  assert(provider.schemaVersion === 1 && provider.provider === 'railway' && provider.scope === 'remote cold backup and isolated restore', 'Unknown provider evidence schema/scope.');
  assert(provider.reviewed === true && typeof provider.reviewer === 'string' && provider.reviewer.trim().length > 0, 'Provider evidence requires an explicit review.');
  assert.deepEqual(provider.source, source, 'Provider evidence must bind the designated source service and volume.');
  assert(provider.method === 'railway-volume-backup' || provider.method === 'cold-archive', 'Unknown cold-backup method.');
  assert(provider.backup?.state === 'complete' && typeof provider.backup.id === 'string' && provider.backup.id.trim(), 'Completed backup identity missing.');
  if (provider.method === 'cold-archive') assert(shaPattern.test(provider.backup.archiveSha256 ?? ''), 'Cold archive requires its actual SHA-256.');
  assert(provider.restore?.state === 'complete' && provider.restore.isolated === true && provider.restore.originalVolumeRetained === true && provider.restore.liveRestoreApplied === false && provider.restore.targetContainsOnlyCopiedSourceData === true, 'Restore isolation/preservation evidence missing.');
  const target = provider.target;
  assert(target && target.projectId === source.projectId && target.environmentId === source.environmentId && target.mountPath === '/data', 'Target must be an isolated /data service in the designated project/environment.');
  for (const id of [target.serviceId, target.volumeId, target.deploymentId]) assert(typeof id === 'string' && uuidPattern.test(id), 'Target provider IDs must be real UUIDs.');
  assert(target.serviceId !== source.serviceId && target.volumeId !== source.volumeId, 'Never restore or overwrite the live service/volume.');
  const restoredApi = origin(process.env.SC_RESTORE_API_URL ?? '');
  assert(restoredApi === origin(target.api) && restoredApi !== liveApi && new URL(restoredApi).hostname !== new URL(liveApi).hostname, 'Restore API must match reviewed target and differ from the live ingress.');
  const b0 = time(baseline.at, 'Baseline'); const stopped = time(provider.backup.writersStoppedAt, 'Writers stopped');
  const started = time(provider.backup.startedAt, 'Backup start'); const backedUp = time(provider.backup.completedAt, 'Backup completion');
  const resumed = time(provider.backup.writersResumedAt, 'Writers resumed'); const restoring = time(provider.restore.startedAt, 'Restore start');
  const restored = time(provider.restore.completedAt, 'Restore completion'); const ready = time(provider.restore.readyAt, 'Restored readiness');
  const reviewed = time(provider.reviewedAt, 'Provider review');
  assert(b0 <= stopped && stopped <= started && started <= backedUp && backedUp <= resumed && backedUp <= restoring && restoring <= restored && restored <= ready && ready <= reviewed, 'Cold backup/restore timestamps are missing or out of order.');
  assert(provider.baselineSha256 === hash(baselineBytes), 'Provider evidence must bind the actual existing restart baseline bytes.');
  assert(Array.isArray(provider.proofs) && provider.proofs.length > 0 && provider.proofs.length <= 20, 'Reviewed raw provider/inspection proofs are required.');
  for (const proof of provider.proofs) {
    assert(shaPattern.test(proof.sha256) && proof.path !== providerPath && proof.path !== 'evidence/backup-check.json', 'Proof cannot be an unchecked aggregate or self-reference.');
    assert(hash(publicFile(proof.path)) === proof.sha256, 'Provider proof bytes changed: ' + proof.path);
  }
  assert(Array.isArray(provider.sourceGalleryRows) && provider.sourceGalleryRows.length <= 500 && provider.sourceGalleryRows.length >= baseline.baseline.assets.length, 'Cold-source gallery rows missing or out of bounds.');
  const rows = new Map(provider.sourceGalleryRows.map(row => { registeredRow(row); return [row.mint, row]; }));
  assert(rows.size === provider.sourceGalleryRows.length, 'Duplicate source gallery mint.');
  assert(provider.sourceGalleryRows.some(row => row.kind === 'nft') && provider.sourceGalleryRows.some(row => row.kind === 'meme'), 'Both asset types must be present in the source manifest.');
  for (const asset of baseline.baseline.assets) {
    assert(shaPattern.test(asset.accountHash), 'Missing baseline mint-byte hash.');
    const row = rows.get(asset.mint); assert(row && row.verifiedAt === asset.verifiedAt, 'A baseline gallery row/verifiedAt is missing from cold backup manifest.');
    assert(Object.keys(asset.hashes).length === 2 && asset.hashes[row.uri] && asset.hashes[row.image] && Object.values(asset.hashes).every(value => shaPattern.test(value)), 'Baseline immutable asset hashes must match retained URLs.');
    assert(row.kind === 'nft' ? typeof asset.owner === 'string' : asset.owner === null, 'Baseline ownership snapshot missing.');
    if (asset.owner) new PublicKey(asset.owner);
  }
  matchingReceipt(provider.sourceFaucetReceipt, baseline);
  return { canonical, canonicalHash: hash(canonicalBytes), baseline, baselineHash: hash(baselineBytes), provider, providerPath, providerHash: hash(providerBytes), restoredApi };
}
async function json<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000) });
  assert(response.ok, 'Recovery API request failed: ' + response.status + ' ' + new URL(url).pathname);
  return response.json() as Promise<T>;
}
async function fileHash(url: string) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  assert(response.ok, 'Immutable file unavailable: ' + url);
  const bytes = new Uint8Array(await response.arrayBuffer()); assert(bytes.length <= 24_576, 'Immutable file exceeds asset limit.'); return hash(bytes);
}
async function gallery(api: string) {
  const rows: GalleryEntry[] = []; let cursor: string | null = null;
  for (let page = 0; page < 11; page++) {
    const next: { entries: GalleryEntry[]; nextCursor: string | null } = await json(api + '/api/gallery?limit=50' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    assert(Array.isArray(next.entries), 'Restored gallery unavailable.'); rows.push(...next.entries);
    assert(rows.length <= 500, 'Recovery gallery exceeds bounded review manifest.');
    if (next.nextCursor === null) return rows;
    assert(typeof next.nextCursor === 'string' && /^\d+$/.test(next.nextCursor) && next.nextCursor !== cursor, 'Gallery cursor invalid.'); cursor = next.nextCursor;
  }
  throw new Error('Gallery pagination did not terminate.');
}
async function main() {
  let context: ReturnType<typeof inputs> | undefined;
  try {
    context = inputs();
    if (checkInputsOnly) { console.log('Recovery inputs validated; no network requests performed and no recovery acceptance claimed.'); return; }
    const { canonical, baseline, provider, restoredApi } = context;
    const facts = await json<NetworkFacts>(restoredApi + '/api/network');
    assert(facts.mode === 'remote' && facts.hasMonetaryValue === false && facts.denomination === 'TEST' && facts.expectedGenesisHash === canonical.expectedGenesisHash && facts.tokenProgram === canonical.tokenProgram && facts.associatedTokenProgram === canonical.associatedTokenProgram, 'Restored configuration is not the canonical TEST chain.');
    const connection = new Connection(restoredApi + '/api/rpc', { commitment: 'finalized', disableRetryOnRateLimit: true, fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) }) });
    await assertNetwork(connection, canonical.expectedGenesisHash!);
    const status = await json<{ state: string; genesisMatches: boolean; slot: number | null }>(restoredApi + '/api/status');
    assert(status.state === 'online' && status.genesisMatches === true && Number.isSafeInteger(status.slot), 'Restored runtime is not ready.');
    const startingFinalizedSlot = await connection.getSlot('finalized');
    const restoredRows = await gallery(restoredApi);
    const normalized = (rows: GalleryEntry[]) => rows.map(registeredRow).sort((a, b) => String(a.mint).localeCompare(String(b.mint)));
    assert.deepEqual(normalized(restoredRows), normalized(provider.sourceGalleryRows), 'Persisted gallery rows/verifiedAt changed or disappeared.');
    const balances: Record<string, number> = {};
    for (const [address, amount] of Object.entries(baseline.baseline.balances)) {
      const actual = await connection.getBalance(new PublicKey(address), 'finalized');
      assert.equal(actual, amount, 'Restored canary balance changed.'); balances[address] = actual;
    }
    const restoredAssets = [];
    for (const asset of baseline.baseline.assets) {
      const row = restoredRows.find(entry => entry.mint === asset.mint); assert(row, 'Restored known mint registry missing.');
      const registered = await json<GalleryEntry>(restoredApi + '/api/gallery/' + asset.mint);
      assert.deepEqual(registeredRow(registered), registeredRow(row), 'Restored detail row differs from database registry.');
      const verified = await verifyAsset(connection, registered); // Supply, decimals, metadata and all immutable authorities.
      const account = await connection.getAccountInfo(new PublicKey(asset.mint), 'finalized'); assert(account, 'Restored known mint missing.');
      assert.equal(hash(account.data), asset.accountHash, 'Restored immutable mint bytes changed.');
      const owner = row.kind === 'nft' ? await currentNftOwner(connection, row.mint) : null;
      assert.equal(owner, asset.owner, 'Restored NFT owner changed.');
      const files = [];
      for (const [originalUrl, expectedHash] of Object.entries(asset.hashes)) {
        const restoredUrl = restoredApi + new URL(originalUrl).pathname;
        const [originalHash, restoredHash] = await Promise.all([fileHash(originalUrl), fileHash(restoredUrl)]);
        assert.equal(originalHash, expectedHash, 'Original immutable URL changed.'); assert.equal(restoredHash, expectedHash, 'Restored immutable file missing/changed.');
        files.push({ originalUrl, restoredUrl, sha256: restoredHash });
      }
      restoredAssets.push({ mint: row.mint, accountHash: hash(account.data), kind: row.kind, supply: verified.mint.supply.toString(), decimals: verified.mint.decimals, immutableAuthoritiesVerified: true, owner, verifiedAt: registered.verifiedAt, files });
    }
    // Check the original grant is finalized BEFORE replay. A missing DB row can
    // at worst trigger a duplicate in the isolated copy; the balance check fails.
    const signature = baseline.receipt.signature!;
    const before = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    assert(before && before.err === null && before.confirmationStatus === 'finalized', 'Original faucet grant not finalized in restored ledger.');
    const repeated = await json<FaucetReceipt>(restoredApi + '/api/faucet', { publicKey: baseline.wallet, requestId: baseline.requestId });
    matchingReceipt(repeated, baseline); assert.equal(repeated.state, 'confirmed', 'Original restored faucet receipt is not confirmed.');
    assert.equal(await connection.getBalance(new PublicKey(baseline.wallet), 'finalized'), baseline.baseline.balances[baseline.wallet], 'Faucet UUID replay granted a second payment.');
    let laterSlot = await connection.getSlot('finalized');
    const progressionStarted = Date.now();
    while (laterSlot <= startingFinalizedSlot && Date.now() - progressionStarted < 60_000) {
      await new Promise(resolve => setTimeout(resolve, 3_000));
      laterSlot = await connection.getSlot('finalized');
    }
    assert(laterSlot > startingFinalizedSlot, 'Restored finalized slot did not progress during verification.');
    evidence('backup-check', { schemaVersion: 1, at: new Date().toISOString(), scope: 'remote isolated cold-backup restore verification; not production cutover or host reboot', passed: true, genesis: canonical.expectedGenesisHash, liveApi, restoredApi, source, target: provider.target, backupId: provider.backup.id, method: provider.method, providerEvidence: { path: context.providerPath, sha256: context.providerHash }, baselineEvidence: { path: 'evidence/restart-baseline.json', sha256: context.baselineHash }, canonicalConfig: { path: 'config/network.remote.json', sha256: context.canonicalHash }, timings: { backup: provider.backup, restore: provider.restore }, balances, assets: restoredAssets, galleryRowsPreserved: restoredRows.length, galleryRowsSha256: hash(JSON.stringify(normalized(restoredRows))), faucet: { requestId: repeated.requestId, signature: repeated.signature, lamports: repeated.lamports, state: repeated.state, noDoubleGrant: true }, finalizedSlot: laterSlot });
    console.log('Verified isolated restored genesis, canary balances, immutable mint bytes/supply/authorities, NFT owners, original asset URLs, gallery rows and unchanged faucet UUID receipt.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown isolated recovery verification failure.';
    if (!checkInputsOnly) evidence('backup-check', { schemaVersion: 1, at: new Date().toISOString(), scope: 'remote isolated cold-backup restore verification', passed: false, genesis: context?.canonical.expectedGenesisHash ?? null, liveApi, restoredApi: context?.restoredApi ?? null, providerEvidence: context ? { path: context.providerPath, sha256: context.providerHash } : null, error: message });
    throw error;
  }
}
await main();
