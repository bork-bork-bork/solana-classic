import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
const readonlyRpc = new Set(['getGenesisHash','getHealth','getVersion','getLatestBlockhash','getBlockHeight','getBalance','getAccountInfo','getMultipleAccounts','getTokenAccountsByOwner','getTokenLargestAccounts','getTokenSupply','getTokenAccountBalance','getMinimumBalanceForRentExemption','getSignatureStatuses','getTransaction','getFeeForMessage','simulateTransaction','getSlot','getBlockTime']);
export function isReadOnly(request) {
  if (request.method === 'OPTIONS') return true;
  if (request.method === 'GET') return request.url.split('?')[0] !== '/api/status';
  return request.method === 'POST' && request.url === '/api/rpc' && !!request.body && !Array.isArray(request.body) && readonlyRpc.has(request.body.method);
}
export function validRelease(release, proof, manifest, proofSha, now=Date.now()) {
  const approved=Date.parse(release?.approvedAt), verified=Date.parse(proof?.at);
  return release?.action==='enable-source-testnet-writes' && release.migrationId===manifest.migrationId && release.runId===manifest.runId && release.genesis===manifest.genesis && release.proofSha256===proofSha &&
    proof?.passed===true && proof.migrationId===manifest.migrationId && proof.runId===manifest.runId && proof.genesis===manifest.genesis && proof.validatorSha256===manifest.binaries['solana-test-validator'].sha256 && /^[a-f0-9]{64}$/.test(proof.backupArchiveSha256??'') && Number.isFinite(approved) && Number.isFinite(verified) && approved>=verified && approved<=now && verified>=Date.parse(manifest.preparedAt);
}
function privateBytes(path) {
  const stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o077)||stat.nlink!==1||stat.size>8192)throw Error('Invalid maintenance control file');
  return readFileSync(path);
}
export function migrationHeld() {
  try {
    const manifest=JSON.parse(readFileSync(new URL('./release.json',import.meta.url)));
    const base='/data/migration/'+manifest.migrationId;
    const proofBytes=privateBytes(base+'/continuity-pass.json');
    return !validRelease(JSON.parse(privateBytes(base+'/enable-writes.json')),JSON.parse(proofBytes),manifest,createHash('sha256').update(proofBytes).digest('hex'));
  } catch { return true; }
}
