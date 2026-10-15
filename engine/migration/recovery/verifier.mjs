// Exact-source API reads and archived receipt replay on one isolated loopback copy.
// No signing, key import, new faucet request, public ingress or release controls.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

export const GENESIS = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
export const MAX_GALLERY = 10000;
const WORKER = '29189101-226c-483b-a424-b8cd140abd80';
const ROOT = '/data/classic-recovery';
const INPUTS = '/data/classic-recovery-inputs';
const RPC = 'http://127.0.0.1:25899';
const ORIGIN = 'https://network-release-production.up.railway.app';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function admitAttempt(attempt, env) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(attempt ?? '') || env.RAILWAY_SERVICE_ID !== WORKER || env.SC_OPERATION || env.SC_MIGRATION_MODE || env.SC_QA_PREFUND) throw Error('Only isolated worker attempt allowed');
  return { root: ROOT + '/' + attempt, inputs: INPUTS + '/' + attempt };
}
export function assertPage(page, count, previous, expected) {
  if (!Array.isArray(page.entries) || page.entries.length > 50 || count + page.entries.length > expected || expected < 1 || expected > MAX_GALLERY) throw Error('Full finite gallery bound required');
  if (page.nextCursor !== null && (!/^\d+$/.test(page.nextCursor ?? '') || Number(page.nextCursor) !== count + page.entries.length || Number(page.nextCursor) <= previous)) throw Error('Gallery cursor does not progress');
}
export function assertExistingReceipt(result, expected) {
  if (result.created !== false || result.receipt.requestId !== expected.request_id || result.receipt.signature !== expected.signature || result.receipt.state !== expected.state || result.receipt.lamports !== 1000000000) throw Error('Archived receipt replay created or changed grant');
}
export async function verify(attempt) {
  const { root, inputs } = admitAttempt(attempt, process.env);
  const runtime = inputs + '/runtime';
  const freeze = JSON.parse(readFileSync(inputs + '/candidate-freeze.json'));
  const baseline = JSON.parse(readFileSync(inputs + '/official-inventory.json'));
  const appManifest = JSON.parse(readFileSync(inputs + '/app-baseline.json'));
  const require = createRequire(runtime + '/package.json');
  const { Connection, PublicKey } = require('@solana/web3.js');
  const { Store } = await import(pathToFileURL(runtime + '/apps/api/src/store.ts'));
  const { createApp } = await import(pathToFileURL(runtime + '/apps/api/src/app.ts'));
  const { verifyAsset, currentNftOwner } = await import(pathToFileURL(runtime + '/packages/chain/src/index.ts'));
  const facts = JSON.parse(readFileSync(root + '/restored/network.json'));
  if (freeze.genesis !== GENESIS || facts.expectedGenesisHash !== GENESIS || facts.hasMonetaryValue !== false || facts.operatorCount !== 1) throw Error('Wrong restored valueless network');
  const connection = new Connection(RPC, { commitment: 'finalized', disableRetryOnRateLimit: true, fetch: (url, init) => {
    if (new URL(url).origin !== RPC) throw Error('Only isolated loopback RPC allowed');
    return fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
  } });
  if (await connection.getGenesisHash() !== GENESIS) throw Error('Restored RPC genesis differs');
  const startingSlot = await connection.getSlot('finalized');
  const settings = { network: facts, dataDir: root + '/restored/app', assetOrigin: ORIGIN, allowedOrigins: [freeze.candidate.frontendOrigin], upstreamUrl: RPC + '/', port: 25910, hosting: 'linux' };
  // Calling createApp is the supported in-process API factory. Its migration
  // hold stays intact and no listener or provider identity is impersonated.
  const { app } = await createApp(settings);
  const store = new Store(settings.dataDir);
  try {
    const get = async path => { const response = await app.inject({ method: 'GET', url: path }); if (response.statusCode !== 200) throw Error('Restored exact-source read failed'); return response; };
    const restoredRuntime = (await get('/api/runtime')).json();
    if (restoredRuntime.genesis !== GENESIS || restoredRuntime.sourceCommit !== freeze.runtime.sourceCommit || restoredRuntime.coreSha256 !== freeze.runtime.coreSha256 || digest(JSON.stringify(restoredRuntime.engineBuild)) !== digest(JSON.stringify(freeze.runtime.engineBuild))) throw Error('Restored source manifest mismatch');
    if ((await get('/healthz')).json().state !== 'online') throw Error('Restored API health failed');
    const expectedCount = appManifest.tables.gallery.rows;
    const rows = []; let cursor = 0;
    for (let pages = 0; pages <= Math.ceil(MAX_GALLERY / 50); pages++) {
      const page = (await get('/api/gallery?limit=50&cursor=' + cursor)).json();
      assertPage(page, rows.length, cursor, expectedCount); rows.push(...page.entries);
      if (page.nextCursor === null) break;
      cursor = Number(page.nextCursor);
    }
    if (rows.length !== expectedCount || new Set(rows.map(row => row.mint)).size !== expectedCount || !rows.some(row => row.kind === 'meme') || !rows.some(row => row.kind === 'nft')) throw Error('Complete archived gallery missing');
    let nftOwners = 0; let immutableFiles = 0;
    for (const row of rows) {
      const stored = store.galleryMint(GENESIS, row.mint);
      if (!stored || JSON.stringify(stored) !== JSON.stringify(row)) throw Error('Persisted gallery row differs');
      const detail = (await get('/api/gallery/' + row.mint)).json();
      if (detail.contentHash !== stored.contentHash || detail.issuanceSignature !== stored.issuanceSignature || detail.verifiedAt !== stored.verifiedAt) throw Error('Gallery detail differs from archive');
      await verifyAsset(connection, stored);
      if (row.kind === 'nft') {
        const owner = await currentNftOwner(connection, row.mint);
        if (detail.currentOwner !== owner || !owner) throw Error('NFT owner missing or differs');
        nftOwners++;
      }
      for (const uri of [row.uri, row.image]) {
        const url = new URL(uri);
        if (url.origin !== ORIGIN || url.search || url.hash || url.username || url.password) throw Error('Original immutable URI differs');
        const key = url.pathname.slice(1); const expected = appManifest.files[key];
        if (!expected) throw Error('Original immutable file absent from full manifest');
        const response = await get(url.pathname);
        if (response.rawPayload.length !== expected.bytes || digest(response.rawPayload) !== expected.sha256) throw Error('Restored immutable bytes differ');
        immutableFiles++;
      }
    }
    // Select a real archived, successful, unused canary by its exact archived
    // bank balance. Never substitute the later restart canary or a new UUID.
    const canary = store.db.prepare('SELECT * FROM faucet WHERE state=? AND signature IS NOT NULL ORDER BY request_id').all('confirmed').find(row => baseline.accounts[row.wallet]?.lamports === '1000000000' && baseline.accounts[row.wallet]?.owner === '11111111111111111111111111111111');
    if (!canary) throw Error('No real archived1TEST continuity canary');
    const before = await connection.getBalance(new PublicKey(canary.wallet), 'finalized');
    if (before !== 1000000000) throw Error('Archived canary balance changed');
    const status = (await connection.getSignatureStatuses([canary.signature], { searchTransactionHistory: true })).value[0];
    if (!status || status.err || status.confirmationStatus !== 'finalized') throw Error('Archived faucet finality/history unavailable; do not replace receipt');
    const result = store.reserveFaucet(canary.wallet, canary.ip, canary.request_id, Date.parse(canary.day + 'T12:00:00Z'));
    assertExistingReceipt(result, canary);
    if (await connection.getBalance(new PublicKey(canary.wallet), 'finalized') !== before) throw Error('Archived UUID replay changed balance');
    const held = await app.inject({ method: 'POST', url: '/api/faucet', payload: { publicKey: canary.wallet, requestId: canary.request_id } });
    if (held.statusCode !== 503 || held.json().code !== 'MIGRATION_READ_ONLY') throw Error('Recovery must preserve mutation hold');
    let later = await connection.getSlot('finalized'); const until = Date.now() + 60000;
    while (later <= startingSlot && Date.now() < until) { await new Promise(resolve => setTimeout(resolve, 3000)); later = await connection.getSlot('finalized'); }
    if (later <= startingSlot || await connection.getGenesisHash() !== GENESIS) throw Error('Restored finality does not progress');
    const proof = { schemaVersion: 1, at: new Date().toISOString(), scope: 'remote separate-worker loopback restored validator and exact-source in-process API reads; archived receipt replay through original persistence method only', passed: true, genesis: GENESIS, candidate: freeze.candidate, archiveAccountReview: JSON.parse(readFileSync(root + '/account-proof.json')), freezeSha256: digest(readFileSync(inputs + '/candidate-freeze.json')), sourceCommit: restoredRuntime.sourceCommit, coreSha256: restoredRuntime.coreSha256, galleryRows: rows.length, immutableGalleryFilesVerified: immutableFiles, nftOwnersVerified: nftOwners, canary: { wallet: canary.wallet, requestId: canary.request_id, signature: canary.signature, balance: before, originalReceiptPreserved: true, newGrant: false }, finalizedSlots: [startingSlot, later], publicIngressVerified: false, exactPublicFaucetPostRecoveryVerified: false, migrationHoldPreserved: true, backupCheckAccepted: false, canonicalNetworkChanged: false, broadcasts: 0 };
    writeFileSync(root + '/loopback-proof.json', JSON.stringify(proof, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return proof;
  } finally { store.close(); await app.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  if (process.argv.length !== 3) throw Error('One reviewed attempt UUID required');
  const proof = await verify(process.argv[2]);
  console.log(JSON.stringify({ passed: proof.passed, galleryRows: proof.galleryRows, backupCheckAccepted: false }));
}
