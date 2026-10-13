import { createServer } from 'node:http';
import { setTimeout as pause } from 'node:timers/promises';

const origin = 'https://network-release-production.up.railway.app';
const genesis = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const cadenceMs = 30_000;
const stallMs = 60_000;
const startedAt = new Date().toISOString();
type Observation = { at: string; healthy: boolean; code: string; finalizedSlot: number | null; lastProgressAt: string | null };
type Progress = { slot: number | null; lastProgress: number };
const progress: Progress = { slot: null, lastProgress: Date.now() };
let consecutiveFailures = 0;
let current: Observation = { at: startedAt, healthy: true, code: 'INITIALIZING', finalizedSlot: null, lastProgressAt: null };
let lastProbeAt = 0;
let fixtureAlarm = false;
let healthSignal: Buffer | null = null;
const signalBytes = 192 * 1024 * 1024;
function updateHealthSignal() {
  if (!current.healthy || fixtureAlarm) { if (!healthSignal) healthSignal = Buffer.alloc(signalBytes, 1); }
  else if (healthSignal) { healthSignal = null; globalThis.gc?.(); }
}
const fixtureProof: { passed: boolean; completedAt?: string; steps: Observation[] } = { passed: false, steps: [] };
const selfTest = process.argv.includes('--self-test');
const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
const publicOrigin = publicDomain && /^[a-z0-9.-]+\.up\.railway\.app$/.test(publicDomain) ? 'https://' + publicDomain : undefined;
let signalDispatch = { at: '', ok: false, status: 0 };

async function json(url: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: AbortSignal.timeout(8_000) });
  if (!response.ok || !response.body) throw new Error('UPSTREAM_FAILURE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 32_768) { await reader.cancel(); throw new Error('INVALID_RESPONSE'); } chunks.push(part.value); }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_RESPONSE');
  return value as Record<string, unknown>;
}

async function probe(target: string, prior: Progress): Promise<Observation> {
  const now = Date.now();
  try {
    const [health, status, chain, slot] = await Promise.all([
      json(target + '/healthz'), json(target + '/api/status'),
      json(target + '/api/rpc', { jsonrpc: '2.0', id: 'monitor-genesis', method: 'getGenesisHash', params: [] }),
      json(target + '/api/rpc', { jsonrpc: '2.0', id: 'monitor-slot', method: 'getSlot', params: [{ commitment: 'finalized' }] })
    ]);
    if (chain.id !== 'monitor-genesis' || chain.jsonrpc !== '2.0' || chain.error || chain.result !== genesis || status.genesisMatches !== true) throw new Error('IDENTITY_FAILURE');
    if (slot.id !== 'monitor-slot' || slot.jsonrpc !== '2.0' || slot.error || !Number.isSafeInteger(slot.result) || Number(slot.result) < 0) throw new Error('INVALID_RESPONSE');
    const finalizedSlot = Number(slot.result);
    if (prior.slot !== null && finalizedSlot < prior.slot) throw new Error('SLOT_REGRESSION');
    if (prior.slot === null || finalizedSlot > prior.slot) { prior.slot = finalizedSlot; prior.lastProgress = now; }
    if (now - prior.lastProgress >= stallMs) throw new Error('FINALIZED_SLOT_STALLED');
    if (health.state !== 'online' || status.state !== 'online') throw new Error('API_DEGRADED');
    return { at: new Date(now).toISOString(), healthy: true, code: 'ONLINE', finalizedSlot, lastProgressAt: new Date(prior.lastProgress).toISOString() };
  } catch (error) {
    const safe = ['UPSTREAM_FAILURE', 'INVALID_RESPONSE', 'IDENTITY_FAILURE', 'SLOT_REGRESSION', 'FINALIZED_SLOT_STALLED', 'API_DEGRADED'];
    const code = error instanceof Error && safe.includes(error.message) ? error.message : 'UPSTREAM_FAILURE';
    return { at: new Date(now).toISOString(), healthy: false, code, finalizedSlot: prior.slot, lastProgressAt: prior.slot === null ? null : new Date(prior.lastProgress).toISOString() };
  }
}

async function publishSignal(path: '/signal' | '/alert-test') {
  if (!publicOrigin) return;
  try {
    const response = await fetch(publicOrigin + path, { redirect: 'error', signal: AbortSignal.timeout(8_000) });
    await response.body?.cancel();
    signalDispatch = { at: new Date().toISOString(), ok: [200, 503].includes(response.status), status: response.status };
  } catch { signalDispatch = { at: new Date().toISOString(), ok: false, status: 0 }; }
}

async function runFixture() {
  // This fixture is loopback-only. No public test RPC or mutation control exists.
  let fail = false; let slot = 100;
  const fixture = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as { id?: string; method?: string } : {};
    response.setHeader('Content-Type', 'application/json');
    if (fail) { response.statusCode = 503; response.end('{"state":"degraded"}'); return; }
    response.end(JSON.stringify(request.url === '/api/rpc' ? { jsonrpc: '2.0', id: body.id, result: body.method === 'getGenesisHash' ? genesis : slot } : { state: 'online', genesisMatches: true }));
  });
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const address = fixture.address(); if (!address || typeof address === 'string') throw new Error('Fixture did not bind.');
  const target = 'http://127.0.0.1:' + address.port;
  const prior: Progress = { slot: null, lastProgress: Date.now() };
  const record = async () => {
    const result = await probe(target, prior); fixtureProof.steps.push(result); fixtureAlarm = !result.healthy;
    updateHealthSignal(); await publishSignal('/alert-test'); console.log(JSON.stringify({ event: 'monitor-fixture', ...result })); return result;
  };
  try {
    const first = await record();
    if (!selfTest) await pause(35_000); // Allow a hosted baseline metric sample.
    fail = true; const failed = await record();
    if (!selfTest) await pause(330_000); // Hold only the bounded monitor signal across provider evaluation intervals.
    fail = false; slot++; const recovered = await record();
    // A real elapsed-time stall verifies the 60-second detector; no clock shortcut.
    await pause(stallMs + 500); const stalled = await record();
    slot++; const resumed = await record();
    fixtureProof.passed = first.healthy && !failed.healthy && failed.code === 'UPSTREAM_FAILURE' && recovered.healthy && !stalled.healthy && stalled.code === 'FINALIZED_SLOT_STALLED' && resumed.healthy;
    fixtureProof.completedAt = new Date().toISOString();
    if (!fixtureProof.passed) throw new Error('Controlled failure/recovery probe failed.');
  } finally { fixtureAlarm = false; updateHealthSignal(); await new Promise<void>(resolve => fixture.close(() => resolve())); await publishSignal('/alert-test'); }
}

if (selfTest) {
  await runFixture(); console.log(JSON.stringify({ scope: 'local loopback HTTP fixture with real 60-second elapsed stall; no network mutations or email delivery claim', genesis, ...fixtureProof }));
  process.exitCode = fixtureProof.passed ? 0 : 1;
} else {
  if (process.env.RAILWAY_PROJECT_ID !== '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe' || process.env.RAILWAY_SERVICE_ID !== 'ed491e1f-e40f-4050-bebe-113792bb4ae8') throw new Error('Monitor requires the designated independent Railway service.');
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') { response.statusCode = 405; response.end('{"code":"READ_ONLY"}'); return; }
    const overdue = lastProbeAt > 0 && Date.now() - lastProbeAt > 70_000;
    if (request.url === '/healthz') { response.statusCode = overdue ? 503 : 200; response.end(JSON.stringify({ state: overdue ? 'degraded' : 'online' })); return; }
    if (request.url === '/alert-test' && process.env.SC_MONITOR_FIXTURE !== '1') { response.statusCode = 404; response.end('{"code":"FIXTURE_DISABLED"}'); return; }
    if (request.url === '/signal' || request.url === '/alert-test') { const healthy = request.url === '/signal' ? current.healthy && !overdue : !fixtureAlarm; response.statusCode = healthy ? 200 : 503; response.end(JSON.stringify({ state: healthy ? 'online' : 'degraded', scope: request.url === '/signal' ? 'canonical-network' : 'controlled-fixture' })); return; }
    if (request.url !== '/api/monitor') { response.statusCode = 404; response.end('{"code":"NOT_FOUND"}'); return; }
    response.end(JSON.stringify({ schemaVersion: 1, genesis, target: origin, startedAt, pollEveryMs: cadenceMs, stalledAfterMs: stallMs, current, consecutiveFailures, lastProbeAt: lastProbeAt ? new Date(lastProbeAt).toISOString() : null, overdue, publicSignalConfigured: Boolean(publicOrigin), signalDispatch, fixture: fixtureProof, fixtureEnabled: process.env.SC_MONITOR_FIXTURE === '1', memoryHealthSignal: { active: Boolean(healthSignal), bytes: signalBytes, rssBytes: process.memoryUsage().rss, thresholdGB: 0.18, scope: 'derived network health; bounded monitor allocation, not resource pressure' }, deploymentId: process.env.RAILWAY_DEPLOYMENT_ID }));
  });
  await new Promise<void>(resolve => server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', resolve));
  if (process.env.SC_MONITOR_FIXTURE === '1') void runFixture().catch(() => console.log('{"event":"monitor-fixture","code":"TEST_FAILED"}'));
  while (true) {
    const began = Date.now(); const result = await probe(origin, progress); lastProbeAt = Date.now();
    consecutiveFailures = result.healthy ? 0 : consecutiveFailures + 1;
    current = { ...result, healthy: result.healthy || (consecutiveFailures < 2 && !['IDENTITY_FAILURE', 'SLOT_REGRESSION', 'FINALIZED_SLOT_STALLED'].includes(result.code)) };
    updateHealthSignal();
    console.log(JSON.stringify({ event: 'network-monitor', ...current, consecutiveFailures }));
    await publishSignal('/signal'); await pause(Math.max(1, cadenceMs - (Date.now() - began)));
  }
}
