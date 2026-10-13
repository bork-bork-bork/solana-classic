import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';
import { createApp } from '../apps/api/src/app.js';
import { loadSettings } from '../apps/api/src/settings.js';
import { encodeBase58, KNOWN_PUBLIC_GENESIS } from '@solana-classic/chain';

const target = { projectId: '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe', environmentId: '3367b373-2332-4702-8cce-c12b8f03949e', serviceId: '43fc867b-1105-423c-a901-84ec5cb9a46a', deploymentId: '151fa230-bedb-416f-b902-e28079708ee0' };
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
type Reply = { status: number; body: Record<string, unknown> };
type FaultResult = { name: string; port: number; expectedGenesis: string; upstream: string; status: Reply; health: Reply; checks: { path: string; method?: string; response: Reply; readOnly?: boolean; passed?: boolean }[]; rowsBefore: Record<string, number>; rowsAfter: Record<string, number>; persistentRowsUnchanged: boolean; closed: boolean; passed: boolean };
async function request(origin: string, path: string, body?: unknown): Promise<Reply> {
  const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}
async function rpc(method: string) {
  const response = await request('http://127.0.0.1:8899', '/', { jsonrpc: '2.0', id: randomUUID(), method, params: method === 'getSlot' ? [{ commitment: 'finalized' }] : [] });
  if (response.status !== 200 || response.body.error || !('result' in response.body)) throw new Error('Actual restored validator read unavailable.');
  return response.body.result;
}
async function closedPort(port: number) {
  try { await fetch('http://127.0.0.1:' + port + '/healthz', { signal: AbortSignal.timeout(1_000) }); return false; } catch { return true; }
}
export async function remoteFaultControls() {
  if (process.env.RAILWAY_PROJECT_ID !== target.projectId || process.env.RAILWAY_ENVIRONMENT_ID !== target.environmentId || process.env.RAILWAY_SERVICE_ID !== target.serviceId || process.env.RAILWAY_DEPLOYMENT_ID !== target.deploymentId) throw new Error('Fault controls are restricted to the designated isolated restored deployment.');
  const base = loadSettings(); const genesis = base.network.expectedGenesisHash;
  const freezeBytes = readFileSync('/data/fault-inputs-35f/candidate-freeze.json');
  const freeze = JSON.parse(freezeBytes.toString('utf8'));
  if (hash(freezeBytes) !== 'de996a8ca58a9d12cf2b264ab86d4e6eab6a3230a779d250402918b288309b82' || freeze.passed !== true || freeze.candidate.apiCommit !== '35f0eaf1dede45452c9cdf9e6403669e966c427d' || freeze.genesis !== genesis) throw new Error('Reviewed final candidate input differs.');
  const publicGuardBytes = readFileSync('/data/fault-inputs-35f/genesis-public-guard-repaired.json');
  const publicGuard = JSON.parse(publicGuardBytes.toString('utf8'));
  if (publicGuard.passed !== true || publicGuard.sourceCommit !== freeze.candidate.apiCommit || publicGuard.coreSha256 !== freeze.runtime.coreSha256 || publicGuard.submittedTransactions !== 0 || publicGuard.walletCreated !== false || publicGuard.checks.length !== 2 || !publicGuard.checks.every((check: any) => check.matchedExpectedActual === true && check.deniedByCurrentSDK === true)) throw new Error('Actual repaired matched-public-genesis proof differs.');
  const fixtureRoot = process.env.SC_FAULT_DATA_ROOT;
  if (!fixtureRoot || !/^\/data\/fault-fixture-[a-f0-9-]{36}$/.test(fixtureRoot)) throw new Error('An owned temporary fault-data root is required.');
  if (base.network.mode !== 'remote' || base.network.hasMonetaryValue !== false || !genesis || KNOWN_PUBLIC_GENESIS.has(genesis) || base.dataDir !== '/data/app' || base.upstreamUrl !== 'http://127.0.0.1:8899/') throw new Error('Isolated TEST settings are not canonical.');
  const configurationHash = hash(readFileSync('/data/network.json'));
  const beforeRuntime = await request('http://127.0.0.1:3000', '/api/runtime');
  if (beforeRuntime.status !== 200 || beforeRuntime.body.configured !== true || beforeRuntime.body.genesis !== genesis || await rpc('getGenesisHash') !== genesis) throw new Error('Normal restored runtime/validator identity unavailable.');
  if (beforeRuntime.body.sourceCommit !== freeze.candidate.apiCommit || beforeRuntime.body.coreSha256 !== freeze.runtime.coreSha256 || beforeRuntime.body.deploymentId !== target.deploymentId) throw new Error('Actual isolated source differs from final candidate.');
  const beforeSlot = await rpc('getSlot');
  if (!Number.isSafeInteger(beforeSlot)) throw new Error('Restored slot unavailable.');
  const sourceFiles = Object.fromEntries(['apps/api/src/app.ts','apps/api/src/settings.ts','apps/api/src/store.ts','packages/chain/src/index.ts'].map(path => [path, hash(readFileSync(resolve('/app', path)))]));
  for (const [path, checksum] of Object.entries(sourceFiles)) if (freeze.coreFiles[path] !== checksum) throw new Error('Frozen private-gateway source mismatch: ' + path);
  const manifest = JSON.parse(readFileSync('/app/config/runtime-build.json', 'utf8'));
  const initialImageHashes = Object.fromEntries(Object.keys(manifest.files).map(path => [path, hash(readFileSync('/app/' + path))]));
  if (Object.entries(manifest.files).some(([path, checksum]) => initialImageHashes[path] !== checksum) || Object.keys(manifest.files).length !== 33) throw new Error('Frozen 33-file runtime source mismatch.');
  const fixtures: FaultResult[] = []; const directories: string[] = [];
  const transaction = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), Buffer.from([1, 0, 0, 1]), Buffer.alloc(64), Buffer.from([0])]).toString('base64');
  try {
    for (const fault of [
      { name: 'wrong configured genesis against actual restored validator', port: 3002, expectedGenesis: 'deliberately-misconfigured-TEST-genesis', upstream: base.upstreamUrl },
      { name: 'known public configured genesis against actual restored validator', port: 3002, expectedGenesis: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', upstream: base.upstreamUrl },
      { name: 'actual unavailable loopback upstream without stopping validator', port: 3003, expectedGenesis: genesis, upstream: 'http://127.0.0.1:8898/' },
    ]) {
      if (!await closedPort(fault.port)) throw new Error('Fault port is already occupied; no existing process was changed.');
      if (fault.port === 3003 && !await closedPort(8898)) throw new Error('Chosen unavailable upstream is occupied.');
      const dataDir = mkdtempSync(fixtureRoot + '/gateway-'); directories.push(dataDir);
      const context = await createApp({ ...base, port: fault.port, dataDir, network: { ...base.network, expectedGenesisHash: fault.expectedGenesis }, upstreamUrl: fault.upstream });
      const rows = () => Object.fromEntries(['assets','faucet','gallery','counters'].map(table => [table, (context.store.db.prepare('SELECT COUNT(*) AS count FROM ' + table).get() as { count: number }).count]));
      let result: FaultResult | undefined;
      try {
        await context.app.listen({ port: fault.port, host: '127.0.0.1' });
        const origin = 'http://127.0.0.1:' + fault.port; const mint = new PublicKey(randomBytes(32)).toBase58();
        const status = await request(origin, '/api/status'); const health = await request(origin, '/healthz'); const rowsBefore = rows();
        const checks: FaultResult['checks'] = [];
        for (const [path, body] of [
          ['/api/assets', { mint, kind: 'nft', name: 'Remote fault', symbol: 'FAULT', presetId: 0 }],
          ['/api/faucet', { publicKey: mint, requestId: randomUUID() }],
          ['/api/gallery', { mint, contentHash: 'a'.repeat(64), issuanceSignature: encodeBase58(randomBytes(64)) }],
          ['/api/rpc', { jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: [transaction, { encoding: 'base64' }] }],
          ['/api/rpc', { jsonrpc: '2.0', id: 2, method: 'simulateTransaction', params: [transaction, { encoding: 'base64', sigVerify: true }] }],
        ] as const) {
          const response = await request(origin, path, body);
          const readOnly = 'method' in body && body.method === 'simulateTransaction';
          checks.push({ path, ...('method' in body ? { method: body.method } : {}), response, ...(readOnly ? { readOnly: true, passed: fault.port === 3003 ? response.status === 503 : response.status === 200 && response.body.jsonrpc === '2.0' && response.body.id === 2 && !!(response.body.error || response.body.result) } : { passed: response.status === 503 }) });
        }
        const rowsAfter = rows(); const persistentRowsUnchanged = JSON.stringify(rowsBefore) === JSON.stringify(rowsAfter) && Object.values(rowsAfter).every(count => count === 0);
        result = { ...fault, status, health, checks, rowsBefore, rowsAfter, persistentRowsUnchanged, closed: false, passed: status.status === 200 && status.body.state === 'degraded' && status.body.genesisMatches === false && health.status === 503 && checks.every(check => check.passed === true) && persistentRowsUnchanged };
        fixtures.push(result);
      } finally { await context.app.close(); if (result) { result.closed = await closedPort(fault.port); result.passed &&= result.closed; } }
    }
  } finally { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); }
  await new Promise(resolve => setTimeout(resolve, 1_500));
  const afterSlot = await rpc('getSlot'); const afterRuntime = await request('http://127.0.0.1:3000', '/api/runtime');
  const normalStatus = await request('http://127.0.0.1:3000', '/api/status');
  const normalRuntimeUnchanged = afterRuntime.status === 200 && ['sourceCommit','coreSha256','apiBootId','apiStartedAt','validatorBootId','validatorStartedAt','deploymentId','genesis','agaveVersion','tokenProgramVersion','tokenProgramSha256'].every(key => afterRuntime.body[key] === beforeRuntime.body[key]);
  const validatorUntouched = await rpc('getGenesisHash') === genesis && Number.isSafeInteger(afterSlot) && Number(afterSlot) > Number(beforeSlot) && configurationHash === hash(readFileSync('/data/network.json'));
  const portsClosed = await closedPort(3002) && await closedPort(3003);
  const temporaryDataDirectoriesRemoved = directories.every(path => !existsSync(path));
  const runtimeSourcesUnchanged = Object.entries(initialImageHashes).every(([path, checksum]) => hash(readFileSync('/app/' + path)) === checksum);
  return { at: new Date().toISOString(), scope: 'remote actual isolated wrong/public-genesis and unavailable-upstream admission controls', passed: fixtures.length === 3 && fixtures.every(fault => fault.passed) && normalRuntimeUnchanged && validatorUntouched && portsClosed && normalStatus.body.state === 'online' && temporaryDataDirectoriesRemoved && runtimeSourcesUnchanged, genesis, candidate: freeze.candidate, frozenCandidateBound: true, sourceCommit: freeze.candidate.apiCommit, runtimeCoreSha256: freeze.runtime.coreSha256, freezeProof: { sha256: hash(freezeBytes), frozenAt: freeze.frozenAt }, matchedPublicGenesisProof: { path: 'evidence/genesis-public-guard-repaired.json', sha256: hash(publicGuardBytes) }, helperSourceSha256: hash(readFileSync(fileURLToPath(import.meta.url))), target, runtime: beforeRuntime.body, sourceFiles, faults: fixtures, cleanup: { faultAppsClosed: portsClosed, temporaryDataDirectoriesRemoved, runtimeSourcesUnchanged, runtimeSourceFilesVerified: 33, normalRuntimeUnchanged, validatorUntouched, normalStatus, beforeSlot, afterSlot }, limitations: ['This is private remote loopback gateway evidence, not a public-ingress browser outage test.', 'Upstream unavailability was a separate gateway pointed at an unused loopback port; neither validator was stopped.', 'Each private gateway uses controlled settings with actual repaired deployed API/SDK code; the normal port3000 gateway and validator were untouched. Readonly simulation is reported separately from four mutation-denial checks.', 'Database assets/faucet/gallery/persistent counters stayed empty; ordinary in-memory HTTP admission buckets were not treated as persistent mutation state.'] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await remoteFaultControls(); console.log('REMOTE_FAULT_RESULT ' + JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
}
