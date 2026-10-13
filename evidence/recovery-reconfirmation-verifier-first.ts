import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection, PublicKey } from '@solana/web3.js';
import { assertNetwork, currentNftOwner, verifyAsset } from '@solana-classic/chain';
import type { GalleryEntry, FaucetReceipt } from '@solana-classic/config';
import { root, evidence } from '../scripts/evidence.js';
import { publicJson } from '../scripts/release-check.js';
import { digest, pause, readFreeze, observeFrozen, validateRuntime, assertPrerequisite } from '../scripts/workload.js';

const api = 'https://network-release-production.up.railway.app';
const target = 'https://recovery-drill-production.up.railway.app';
const genesis = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const deployment = '151fa230-bedb-416f-b902-e28079708ee0';
const began = new Date().toISOString();
const freeze = readFreeze(api, genesis);
const initial = publicJson(root, 'evidence/backup-check-initial.json') as any;
const baseline = publicJson(root, 'evidence/restart-baseline.json') as any;
const original = (publicJson(root, 'evidence/cold-source-gallery.json') as any).entries as GalleryEntry[];
const sourceAudit = publicJson(root, 'evidence/recovery-reconfirmation-source-audit.json') as any;
const additions = ['atomic-issuance-harness-failed', 'atomic-issuance-check'].flatMap(name => {
  const proof = publicJson(root, 'evidence/' + name + '.json') as any;
  assert.equal(proof.api, target); assert.equal(proof.genesis, genesis);
  return proof.results.map((result: any) => ({ mint: result.mint as string, issuanceSignature: result.signature as string, kind: result.kind as string, provenance: 'evidence/' + name + '.json', executedAt: proof.at as string, passedOverall: proof.passed as boolean }));
});
const rowKeys = ['mint', 'kind', 'name', 'symbol', 'presetId', 'contentHash', 'uri', 'image', 'issuanceSignature', 'verifiedAt'] as const;
const normalize = (row: GalleryEntry) => Object.fromEntries(rowKeys.map(key => [key, row[key]]));
async function json<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000) });
  assert(response.ok, 'Recovery reconfirm request failed: ' + response.status + ' ' + new URL(url).pathname);
  return response.json() as Promise<T>;
}
async function fileHash(url: string) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  assert(response.ok, 'Immutable file unavailable: ' + url);
  const bytes = new Uint8Array(await response.arrayBuffer()); assert(bytes.length <= 24_576);
  return digest(bytes);
}
async function gallery() {
  const rows: GalleryEntry[] = []; let cursor: string | null = null;
  for (let page = 0; page < 11; page++) {
    const reply = await json<{ entries: GalleryEntry[]; nextCursor: string | null }>(target + '/api/gallery?limit=50' + (cursor ? '&cursor=' + cursor : ''));
    rows.push(...reply.entries); assert(rows.length <= 500);
    if (reply.nextCursor === null) return rows;
    assert(typeof reply.nextCursor === 'string' && /^\d+$/.test(reply.nextCursor) && reply.nextCursor !== cursor); cursor = reply.nextCursor;
  }
  throw new Error('Recovery gallery did not terminate.');
}
try {
  assert.equal(initial.passed, true); assert.equal(initial.genesis, genesis);
  assert.equal(initial.baselineEvidence.sha256, digest(readFileSync(resolve(root, 'evidence/restart-baseline.json'))));
  assert.equal(initial.providerEvidence.sha256, digest(readFileSync(resolve(root, 'evidence/recovery-provider.json'))));
  assert.equal(sourceAudit.initialBackupProof.sha256, digest(readFileSync(resolve(root, 'evidence/backup-check-initial.json'))));
  assert.equal(original.length, 7); assert.equal(additions.length, 4); assert.equal(new Set(additions.map(row => row.mint)).size, 4);
  const beforeMainSlot = await observeFrozen(freeze);
  const runtimeBefore = await json<Record<string, unknown>>(target + '/api/runtime');
  validateRuntime(runtimeBefore, freeze.candidate, genesis);
  assert.equal(runtimeBefore.coreSha256, freeze.runtime.coreSha256); assert.equal(runtimeBefore.deploymentId, deployment);
  for (const field of ['agaveVersion', 'tokenProgramVersion', 'tokenProgramSha256']) assert.equal(runtimeBefore[field], freeze.runtime[field]);
  const facts = await json<any>(target + '/api/network');
  assert.equal(facts.expectedGenesisHash, genesis); assert.equal(facts.mode, 'remote'); assert.equal(facts.hasMonetaryValue, false);
  const connection = new Connection(target + '/api/rpc', { commitment: 'finalized', disableRetryOnRateLimit: true });
  await assertNetwork(connection, genesis);
  const firstSlot = await connection.getSlot('finalized');
  const rows = await gallery();
  assert.equal(rows.length, original.length + additions.length);
  const rowMap = new Map(rows.map(row => [row.mint, row])); assert.equal(rowMap.size, rows.length);
  const allowed = new Set([...original.map(row => row.mint), ...additions.map(row => row.mint)]);
  for (const row of rows) assert(allowed.has(row.mint), 'Unknown post-restore gallery addition: ' + row.mint);
  const originalChecks = [];
  for (const historical of original) {
    const row = rowMap.get(historical.mint); assert(row, 'Original gallery row missing: ' + historical.mint);
    assert.deepEqual(normalize(row), normalize(historical), 'Original row or verifiedAt changed.');
    const detail = await json<GalleryEntry>(target + '/api/gallery/' + row.mint); assert.deepEqual(normalize(detail), normalize(historical));
    const verified = await verifyAsset(connection, detail);
    const account = await connection.getAccountInfo(new PublicKey(row.mint), 'finalized'); assert(account);
    const oldBaseline = baseline.baseline.assets.find((asset: any) => asset.mint === row.mint);
    const owner = row.kind === 'nft' ? await currentNftOwner(connection, row.mint) : null;
    if (oldBaseline) { assert.equal(digest(account.data), oldBaseline.accountHash); assert.equal(owner, oldBaseline.owner); }
    const files = [];
    for (const url of [row.uri, row.image]) {
      assert.equal(new URL(url).origin, api);
      const restoredUrl = target + new URL(url).pathname;
      const originalHash = await fileHash(url); const restoredHash = await fileHash(restoredUrl);
      assert.equal(restoredHash, originalHash, 'Original live/restored immutable bytes differ.');
      if (oldBaseline) assert.equal(restoredHash, oldBaseline.hashes[url], 'Recorded historical immutable hash differs.');
      files.push({ originalUrl: url, restoredUrl, sha256: restoredHash, comparison: oldBaseline ? 'Recorded initial baseline hash and current live URL both matched' : 'Actual new current live-versus-restored immutable comparison; no historical byte hash claimed' });
    }
    originalChecks.push({ mint: row.mint, kind: row.kind, verifiedAt: row.verifiedAt, rowUnchanged: true, accountHash: digest(account.data), recordedBaselineMintBytesMatched: !!oldBaseline, owner, recordedBaselineOwnerMatched: !!oldBaseline, supply: verified.mint.supply.toString(), decimals: verified.mint.decimals, immutableAuthoritiesVerified: true, files });
  }
  assert.equal(originalChecks.filter(row => row.recordedBaselineMintBytesMatched).length, 4);
  const addedChecks = [];
  for (const added of additions) {
    const row = rowMap.get(added.mint); assert(row); assert.equal(row.issuanceSignature, added.issuanceSignature); assert.equal(row.kind, added.kind);
    assert(Date.parse(row.verifiedAt) > Date.parse(initial.at), 'Extra row is not a recorded post-restore addition.');
    await verifyAsset(connection, row);
    addedChecks.push({ ...added, verifiedAt: row.verifiedAt, status: 'Explicitly identified TEST addition after initial cold-restore verification; not part of initial backup dataset' });
  }
  const balances: Record<string, number> = {};
  for (const [address, expected] of Object.entries(baseline.baseline.balances)) {
    const amount = await connection.getBalance(new PublicKey(address), 'finalized'); assert.equal(amount, expected); balances[address] = amount;
  }
  const status = (await connection.getSignatureStatuses([baseline.receipt.signature], { searchTransactionHistory: true })).value[0];
  assert(status && status.err === null && status.confirmationStatus === 'finalized');
  const repeated = await json<FaucetReceipt>(target + '/api/faucet', { publicKey: baseline.wallet, requestId: baseline.requestId });
  assert.equal(repeated.requestId, baseline.requestId); assert.equal(repeated.signature, baseline.receipt.signature); assert.equal(repeated.lamports, baseline.receipt.lamports); assert.equal(repeated.state, 'confirmed');
  assert.equal(await connection.getBalance(new PublicKey(baseline.wallet), 'finalized'), baseline.baseline.balances[baseline.wallet]);
  let lastSlot = await connection.getSlot('finalized');
  for (let i = 0; i < 20 && lastSlot <= firstSlot; i++) { await pause(3_000); lastSlot = await connection.getSlot('finalized'); }
  assert(lastSlot > firstSlot, 'Restored finalized slot did not progress.');
  const runtimeAfter = await json<Record<string, unknown>>(target + '/api/runtime');
  for (const field of ['genesis','sourceCommit','coreSha256','deploymentId','apiBootId','apiStartedAt','validatorBootId','validatorStartedAt','agaveVersion','tokenProgramVersion','tokenProgramSha256']) assert.equal(runtimeAfter[field], runtimeBefore[field], 'Target runtime restarted or changed.');
  const afterMainSlot = await observeFrozen(freeze); assert(afterMainSlot >= beforeMainSlot);
  const verifierFile = 'evidence/recovery-reconfirmation-verifier.ts';
  copyFileSync(resolve(root, '.tools/recovery-reconfirm.ts'), resolve(root, verifierFile));
  const result = { schemaVersion: 2, at: new Date().toISOString(), startedAt: began, scope: 'remote actual final-code reconfirmation of the existing isolated cold-backup restore; no new cold backup or archive extraction performed', passed: true, api, liveApi: api, restoredApi: target, genesis, candidate: freeze.candidate, liveRuntime: freeze.runtime, targetRuntimeBefore: runtimeBefore, targetRuntimeAfter: runtimeAfter, source: initial.source, target: { ...initial.target, deploymentId: deployment }, method: 'existing-cold-archive-final-code-reconfirmation', backupId: initial.backupId, historicalBackupAndRestore: { proof: sourceAudit.initialBackupProof, timings: initial.timings, archiveSha256: initial.timings.backup.archiveSha256, newBackupCreated: false, newArchiveExtracted: false }, sourceAudit: { path: 'evidence/recovery-reconfirmation-source-audit.json', sha256: digest(readFileSync(resolve(root, 'evidence/recovery-reconfirmation-source-audit.json'))) }, verifierSource: { path: verifierFile, sha256: digest(readFileSync(resolve(root, verifierFile))) }, balances, originalGalleryRowsPreserved: 7, totalCurrentGalleryRows: rows.length, originalGalleryRowsSha256: digest(Buffer.from(JSON.stringify(original.map(normalize).sort((a,b) => String(a.mint).localeCompare(String(b.mint)))))), assets: originalChecks, postRestoreAdditions: addedChecks, fundedActorAddedAfterInitialRestore: { publicKey: 'DSW3wmHJr16zvNUsCNmxpjyCXMJwMoGozYbh8psSufYX', provenance: 'evidence/isolated-qa-funding-request.json', status: 'Historical TEST funding after initial cold restore; not an initial backup canary', balanceAtReconfirmation: await connection.getBalance(new PublicKey('DSW3wmHJr16zvNUsCNmxpjyCXMJwMoGozYbh8psSufYX'), 'finalized') }, faucet: { requestId: repeated.requestId, signature: repeated.signature, lamports: repeated.lamports, state: repeated.state, noDoubleGrant: true, noNewUUIDRequested: true }, finalizedSlots: { first: firstSlot, last: lastSlot }, liveFrozenRuntimeAndFrontendUnchanged: true, liveSlots: { before: beforeMainSlot, after: afterMainSlot }, limitations: ['The retained initial proof records the actual cold archive creation and extraction dates. This run reconfirms that existing isolated copy using final candidate code; it did not create a new cold backup or re-extract an archive.', 'The isolated dataset has four explicitly listed TEST asset additions and one TEST funding actor added after initial verification; it is not claimed pristine.', 'This does not claim a hardware-host reboot or production recovery cutover.'] };
  assertPrerequisite(result, 'backup-check', freeze);
  evidence('backup-check', result);
  console.log(JSON.stringify({ passed: true, scope: result.scope, originalRows: 7, knownBaselineMints: 4, postRestoreAddedMints: 4, targetDeployment: deployment, candidate: freeze.candidate, finalizedSlots: result.finalizedSlots }));
} catch (error) {
  evidence('recovery-reconfirmation-failed', { at: new Date().toISOString(), startedAt: began, scope: 'remote final-code recovery reconfirmation failed or incomplete', passed: false, api, target, genesis, candidate: freeze.candidate, error: error instanceof Error ? error.message : 'Unknown recovery reconfirmation failure' });
  throw error;
}
