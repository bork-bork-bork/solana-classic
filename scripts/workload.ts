import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { Connection, Keypair } from '@solana/web3.js';
import { configuredApi, root } from './evidence.js';
import { publicBytes, publicJson } from './release-check.js';
export const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export type Candidate = Record<string, string>;
export type Freeze = { passed: true; scope: string; genesis: string; candidate: Candidate; runtime: Record<string, unknown>; frozenAt: string; coreFiles: Record<string, string>; frontendFiles: Record<string, string> };
const runtimeKeys = ['genesis', 'sourceCommit', 'coreSha256', 'deploymentId', 'apiBootId', 'apiStartedAt', 'validatorBootId', 'validatorStartedAt', 'agaveVersion', 'tokenProgramVersion', 'tokenProgramSha256'] as const;
export async function testInputs() {
  const context = await configuredApi();
  if (context.facts.mode !== 'remote') throw new Error('A local fixture cannot satisfy the workload.');
  return context;
}
export function privateJson(path: string, workspace = root) {
  const file = resolve(workspace, path); const directory = resolve(workspace, '.data');
  if (!file.startsWith(directory + sep)) throw new Error('QA keys must be under ignored .data.');
  let current = workspace;
  for (const part of relative(workspace, file).split(sep)) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('QA key paths cannot contain symlinks.');
  }
  if (!realpathSync(file).startsWith(realpathSync(directory) + sep)) throw new Error('QA keys must be under ignored .data.');
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) || stat.nlink !== 1 || stat.size > 100_000) throw new Error('QA keys must be bounded owner-private regular files.');
    const bytes = readFileSync(fd);
    if (bytes.byteLength > 100_000) throw new Error('QA key file exceeds its bound.');
    try { return JSON.parse(bytes.toString('utf8')) as Record<string, unknown>; }
    catch { throw new Error('Protected TEST input is not valid JSON.'); }
  } finally { closeSync(fd); }
}
export function testKey(value: unknown): Keypair {
  const input = value as { publicKey: string; secretKey: number[] };
  if (!Array.isArray(input?.secretKey) || input.secretKey.length !== 64 || !input.secretKey.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error('Invalid protected TEST key format.');
  let key: Keypair;
  try { key = Keypair.fromSecretKey(Uint8Array.from(input.secretKey)); } catch { throw new Error('Invalid protected TEST key format.'); }
  if (key.publicKey.toBase58() !== input.publicKey) throw new Error('TEST key public identity mismatch.');
  return key;
}
export async function post<T>(api: string, path: string, body: unknown): Promise<T> {
  const r = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Workload API ${path} returned ${r.status}.`);
  return r.json() as Promise<T>;
}
export function pollAtThreeSeconds(connection: Connection) {
  const original = connection.getSignatureStatuses.bind(connection); const next = new Map<string, number>();
  connection.getSignatureStatuses = async (signatures, config) => {
    // Reserve each signature synchronously: concurrent callers and changed batches
    // cannot bypass the same signature's minimum interval.
    const now = Date.now(); const at = Math.max(now, ...signatures.map(s => next.get(s) ?? now));
    for (const signature of signatures) next.set(signature, at + 3_000);
    await pause(at - now);
    return original(signatures, config);
  };
  return connection;
}
export function session(api: string) {
  return pollAtThreeSeconds(new Connection(api + '/api/rpc', { commitment: 'confirmed', disableRetryOnRateLimit: true }));
}
export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  if (p <= 0 || p > 1 || !Number.isFinite(p)) throw new Error('Percentile must be in (0, 1].');
  const sorted = [...values].sort((a, b) => a - b);
  const value = sorted[Math.ceil(sorted.length * p) - 1]!;
  return Number.isFinite(value) ? value : null;
}
export function confirmedMetrics(results: { confirmedMs: number | null }[], expected: number) {
  if (results.length > expected || !Number.isInteger(expected) || expected < 1) throw new Error('Invalid workload denominator.');
  const times = results.map(r => r.confirmedMs !== null && Number.isFinite(r.confirmedMs) && r.confirmedMs >= 0 ? r.confirmedMs : Infinity);
  while (times.length < expected) times.push(Infinity);
  return { successfulWithin15Seconds: times.filter(n => n <= 15_000).length / expected, p95LogicalConfirmedMs: percentile(times, 0.95), missingConfirmations: times.filter(n => !Number.isFinite(n)).length };
}
export function logicalConfirmation(startedAt: number, required: number) {
  const signatures: string[] = []; let confirmedMs: number | null = null;
  return {
    signatures, get confirmedMs() { return confirmedMs; },
    report(progress: { phase: string; signature?: string }) {
      if (progress.phase !== 'confirmed' || !progress.signature || signatures.includes(progress.signature)) return;
      signatures.push(progress.signature);
      if (signatures.length === required) confirmedMs = Date.now() - startedAt;
    },
  };
}
function remoteScope(value: unknown) { return typeof value === 'string' && /(?:remote|production-origin)/i.test(value) && !/(?:local|fixture|mock|not remote|no remote)/i.test(value); }
export function sameCandidate(value: unknown, candidate: Candidate): boolean {
  return !!value && typeof value === 'object' && Object.entries(candidate).every(([key, expected]) => (value as Record<string, unknown>)[key] === expected);
}
export function validateRuntime(runtime: Record<string, unknown>, candidate: Candidate, genesis: string) {
  if (runtime.configured !== true || runtime.genesis !== genesis || runtime.sourceCommit !== candidate.apiCommit || runtimeKeys.some(key => typeof runtime[key] !== 'string' || !runtime[key])) throw new Error('Complete frozen runtime identity is required.');
  for (const key of ['coreSha256','tokenProgramSha256']) if (!/^[a-f0-9]{64}$/.test(String(runtime[key]))) throw new Error('Invalid runtime checksum.');
  for (const key of ['apiStartedAt','validatorStartedAt']) if (!Number.isFinite(Date.parse(String(runtime[key])))) throw new Error('Invalid runtime boot timestamp.');
}
export function validateFreeze(value: unknown, api: string, genesis: string, workspace = root, now = Date.now()): Freeze {
  const freeze = value as Freeze; const candidate = freeze?.candidate;
  if (freeze?.passed !== true || !remoteScope(freeze.scope) || freeze.genesis !== genesis || !candidate || candidate.apiOrigin !== api || !Number.isFinite(Date.parse(freeze.frozenAt)) || Date.parse(freeze.frozenAt) > now) throw new Error('A reviewed frozen remote candidate is required.');
  for (const key of ['apiOrigin','frontendOrigin']) {
    const url = new URL(candidate[key]!);
    if (url.protocol !== 'https:' || url.origin !== candidate[key] || url.username || url.password) throw new Error('Frozen candidate requires HTTPS origins.');
  }
  if (!candidate.frontendDeploymentId || ['apiCommit','frontendCommit'].some(key => !/^[a-f0-9]{40}$/.test(candidate[key] ?? ''))) throw new Error('Deployed candidate source identities are required.');
  for (const [key, file] of [['networkConfigSha256','config/network.remote.json'], ['dependencyManifestSha256','docs/dependency-manifest.json']]) if (candidate[key!] !== digest(publicBytes(workspace, file!))) throw new Error('Frozen candidate configuration changed.');
  validateRuntime(freeze.runtime, candidate, genesis);
  if (!freeze.coreFiles || !Object.keys(freeze.coreFiles).length || !freeze.frontendFiles || !freeze.frontendFiles['/'] || !Object.keys(freeze.frontendFiles).some(path => /^\/assets\/[A-Za-z0-9_.-]+\.js$/.test(path))) throw new Error('Frozen core and production frontend asset checksums are required.');
  const build = publicJson(workspace, 'config/runtime-build.json') as { sourceCommit?: string; coreSha256?: string; files?: Record<string, string> };
  if (build.sourceCommit !== candidate.apiCommit || !build.files || !Object.keys(build.files).length || build.coreSha256 !== freeze.runtime.coreSha256 || digest(Buffer.from(JSON.stringify(build.files))) !== build.coreSha256) throw new Error('Frozen runtime source manifest identity differs.');
  for (const [path, checksum] of Object.entries(build.files)) if (freeze.coreFiles[path] !== checksum) throw new Error('Frozen core omits runtime source: ' + path);
  for (const path of ['config/runtime-build.json','scripts/load.ts','scripts/soak.ts','scripts/workload.ts']) if (!freeze.coreFiles[path]) throw new Error('Frozen core omits stability control: ' + path);
  assertCoreFiles(freeze, workspace);
  for (const [path, checksum] of Object.entries(freeze.frontendFiles)) if (!/^(?:\/|\/assets\/[A-Za-z0-9_.-]+\.(?:js|css))$/.test(path) || !/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid frozen frontend asset.');
  return freeze;
}
export function readFreeze(api: string, genesis: string) { return validateFreeze(publicJson(root, 'evidence/candidate-freeze.json'), api, genesis); }
export function assertCoreFiles(freeze: Freeze, workspace = root) {
  for (const [path, checksum] of Object.entries(freeze.coreFiles)) {
    if (!/^(?:(?:apps|packages|scripts|config|infra)\/[A-Za-z0-9_./-]+|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/.test(path) || path.split('/').some(part => part === '..' || part.startsWith('.')) || !/^[a-f0-9]{64}$/.test(checksum)) throw new Error('Invalid frozen core path or checksum.');
    let current = workspace;
    for (const part of path.split('/')) { current = resolve(current, part); if (lstatSync(current).isSymbolicLink()) throw new Error('Frozen core paths cannot contain symlinks.'); }
    if (digest(readFileSync(current)) !== checksum) throw new Error('Core source changed: ' + path);
  }
}
export function assertPrerequisite(value: unknown, name: string, freeze: Freeze, now = Date.now()) {
  const proof = value as Record<string, unknown>; const at = Date.parse(String(proof?.at));
  if (proof?.passed !== true || !remoteScope(proof.scope) || proof.genesis !== freeze.genesis || !sameCandidate(proof.candidate, freeze.candidate) || !Number.isFinite(at) || at > now || (proof.api && proof.api !== freeze.candidate.apiOrigin) || (proof.web && proof.web !== freeze.candidate.frontendOrigin)) throw new Error('Actual candidate-bound prerequisite evidence must pass: ' + name);
}
export async function observeFrozen(freeze: Freeze) {
  assertCoreFiles(freeze);
  for (const [key, file] of [['networkConfigSha256','config/network.remote.json'], ['dependencyManifestSha256','docs/dependency-manifest.json']]) if (freeze.candidate[key!] !== digest(publicBytes(root, file!))) throw new Error('Frozen candidate configuration changed.');
  const response = await fetch(freeze.candidate.apiOrigin + '/api/runtime', { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Runtime observation unavailable.');
  const current = await response.json() as Record<string, unknown>;
  validateRuntime(current, freeze.candidate, freeze.genesis);
  for (const key of runtimeKeys) if (current[key] !== freeze.runtime[key]) throw new Error('Frozen runtime changed or restarted: ' + key);
  for (const [path, checksum] of Object.entries(freeze.frontendFiles)) {
    const asset = await fetch(freeze.candidate.frontendOrigin + path, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!asset.ok || digest(new Uint8Array(await asset.arrayBuffer())) !== checksum) throw new Error('Frozen production frontend changed: ' + path);
  }
  const statusResponse = await fetch(freeze.candidate.apiOrigin + '/api/status', { signal: AbortSignal.timeout(10_000) });
  if (!statusResponse.ok) throw new Error('Network status observation unavailable.');
  const status = await statusResponse.json() as { state: string; genesisMatches: boolean; slot: number };
  if (status.state !== 'online' || status.genesisMatches !== true || !Number.isSafeInteger(status.slot) || status.slot < 0) throw new Error('Unhealthy experimental network.');
  return status.slot;
}
export function serialMonitor(observe: () => Promise<void>, everyMs = 30_000) {
  let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined; let pending: Promise<void> = Promise.resolve(); let error: string | null = null; let count = 0;
  let nextAt = Date.now() + everyMs;
  const tick = () => {
    const began = Date.now();
    pending = Promise.resolve().then(observe).then(() => {
      if (Date.now() - began > everyMs) throw new Error('Runtime observation exceeded its scheduled cadence.');
      count++;
    }).catch(cause => { error ??= cause instanceof Error ? cause.message : 'Observation failed.'; }).finally(() => {
      nextAt += everyMs;
      if (!stopped && !error) timer = setTimeout(tick, Math.max(0, nextAt - Date.now()));
    });
  };
  timer = setTimeout(tick, everyMs);
  return { check() { if (error) throw new Error(error); }, get observations() { return count; }, async stop() { stopped = true; clearTimeout(timer); await pending; if (error) throw new Error(error); } };
}
