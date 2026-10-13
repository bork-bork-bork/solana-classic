import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { encodeBase58 } from '@solana-classic/chain';
import { LIMITS, type AssetDocument, type GalleryEntry } from '@solana-classic/config';
import { evidence, root } from './evidence.js';
import { testInputs, pause, digest, readFreeze, observeFrozen, type Candidate, type Freeze } from './workload.js';

type Check = { name: string; passed: boolean; observations: unknown; limitation?: string };
type Reply = { status: number; body: Record<string, unknown>; headers: Record<string, string>; bytesSha256: string };
const approvedWeb = 'https://solana-classic-soc.vercel.app';
export async function remoteNegativeControls() {
  const checks: Check[] = []; let api = ''; let genesis: string | null = null; let candidate: Candidate | null = null; let requests = 0;
  let freeze: Freeze | undefined;
  const createdAssetMints: string[] = []; let quotaRequests = 0; let runtime: Record<string, unknown> | null = null;
  const record = (name: string, passed: boolean, observations: unknown, limitation?: string) => checks.push({ name, passed, observations, ...(limitation ? { limitation } : {}) });
  async function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}): Promise<Reply> {
    // Sequential requests remain well below the public global/read admission caps.
    await pause(200); requests++;
    const response = await fetch(api + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > LIMITS.rpcResponseBytes) throw new Error('Remote control response exceeded its public bound.');
    let value: unknown = {};
    try { value = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* Some HTTP errors have no JSON body. */ }
    const selected = Object.fromEntries(['access-control-allow-origin','access-control-allow-headers','access-control-allow-methods','access-control-allow-credentials','cache-control','content-security-policy','x-content-type-options'].flatMap(name => { const value = response.headers.get(name); return value ? [[name, value]] : []; }));
    return { status: response.status, body: value && typeof value === 'object' ? value as Record<string, unknown> : {}, headers: selected, bytesSha256: digest(bytes) };
  }
  const errorCode = (response: Reply) => (response.body.error as { code?: string } | undefined)?.code;
  const rpc = (method: string, params: unknown[] = [], extra = {}) => ({ jsonrpc: '2.0', id: 'negative-' + randomUUID(), method, params, ...extra });
  try {
    const context = await testInputs(); api = context.api; genesis = context.facts.expectedGenesisHash!;
    if (existsSync(resolve(root, 'evidence/candidate-freeze.json'))) { freeze = readFreeze(api, genesis); candidate = freeze.candidate; await observeFrozen(freeze); }
    const initial = await request('/api/runtime'); runtime = initial.body;
    if (initial.status !== 200 || runtime.configured !== true || runtime.genesis !== genesis) throw new Error('Remote runtime identity unavailable.');
    const identity = await request('/api/rpc', 'POST', rpc('getGenesisHash'));
    record('readonly RPC without Origin binds canonical TEST genesis', identity.status === 200 && identity.body.result === genesis, { status: identity.status, actualGenesis: identity.body.result });
    const noOrigin = await request('/api/network');
    record('CLI no-Origin network reads remain available', noOrigin.status === 200 && noOrigin.body.expectedGenesisHash === genesis, { status: noOrigin.status, allowOrigin: noOrigin.headers['access-control-allow-origin'] ?? null });
    for (const origin of ['https://unapproved.example.test','null']) {
      const response = await request('/api/network', 'GET', undefined, { origin });
      record('unapproved Origin denied: ' + origin, response.status === 403 && errorCode(response) === 'ORIGIN_REJECTED' && !response.headers['access-control-allow-origin'], { status: response.status, code: errorCode(response), headers: response.headers });
    }
    const preflightHeaders = { origin: approvedWeb, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,solana-client' };
    const preflight = await request('/api/rpc', 'OPTIONS', undefined, preflightHeaders);
    const allowedHeaders = String(preflight.headers['access-control-allow-headers'] ?? '').split(',').map(s => s.trim().toLowerCase()).sort();
    record('approved browser SDK preflight', preflight.status === 204 && preflight.headers['access-control-allow-origin'] === approvedWeb && JSON.stringify(allowedHeaders) === JSON.stringify(['content-type','solana-client']) && !preflight.headers['access-control-allow-credentials'], { status: preflight.status, headers: preflight.headers });
    const disallowed = await request('/api/rpc', 'OPTIONS', undefined, { ...preflightHeaders, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type,authorization,x-upstream-url' });
    record('unsafe preflight method and headers are excluded', disallowed.status === 204 && !String(disallowed.headers['access-control-allow-methods']).split(',').map(s => s.trim()).includes('PUT') && !/authorization|x-upstream-url/i.test(disallowed.headers['access-control-allow-headers'] ?? ''), { status: disallowed.status, headers: disallowed.headers }, 'The browser enforces the returned allowlist; HTTP preflight itself can return 204.');
    const unknownPreflight = await request('/api/rpc', 'OPTIONS', undefined, { ...preflightHeaders, origin: 'https://unapproved.example.test' });
    record('unknown browser preflight denied', unknownPreflight.status === 403 && !unknownPreflight.headers['access-control-allow-origin'], { status: unknownPreflight.status, code: errorCode(unknownPreflight) ?? null, headers: unknownPreflight.headers }, 'Denied OPTIONS responses may have no JSON error body; HTTP status and absent CORS allowance enforce rejection.');
    for (const method of ['requestAirdrop','validatorExit','setLogFilter','getProgramAccounts']) {
      const response = await request('/api/rpc', 'POST', rpc(method));
      record('forbidden RPC rejected without Origin: ' + method, response.status === 400 && errorCode(response) === 'INVALID_INPUT', { status: response.status, code: errorCode(response) });
    }
    for (const [name, body] of [
      ['batch RPC', [rpc('getGenesisHash'), rpc('getHealth')]],
      ['caller-selected upstream URL', rpc('getGenesisHash', [], { url: 'https://unapproved.example.test' })],
      ['caller-selected upstream property', rpc('getGenesisHash', [], { upstream: 'https://unapproved.example.test' })],
      ['malformed JSON-RPC version', { ...rpc('getHealth'), jsonrpc: '1.0' }],
      ['overlong RPC identifier', { ...rpc('getHealth'), id: 'x'.repeat(101) }],
    ] as const) {
      const response = await request('/api/rpc', 'POST', body);
      record(name + ' rejected', response.status === 400 && errorCode(response) === 'INVALID_INPUT', { status: response.status, code: errorCode(response) });
    }
    for (const [method, params, code] of [
      ['getMultipleAccounts', [Array(101).fill('11111111111111111111111111111111')], 'QUERY_BOUND'],
      ['getSignatureStatuses', [Array(101).fill('2'.repeat(88))], 'QUERY_BOUND'],
      ['getMinimumBalanceForRentExemption', [16_385], 'QUERY_BOUND'],
      ['simulateTransaction', ['%%%'], 'INVALID_TRANSACTION'],
      ['sendTransaction', [Buffer.alloc(1_233).toString('base64')], 'TRANSACTION_SIZE'],
    ] as const) {
      const response = await request('/api/rpc', 'POST', rpc(method, [...params]));
      record(method + ' malformed/oversize bound', response.status === (code === 'TRANSACTION_SIZE' ? 413 : 400) && errorCode(response) === code, { status: response.status, code: errorCode(response) });
    }
    for (const [path, max] of [['/api/rpc',LIMITS.rpcBodyBytes], ['/api/assets',LIMITS.assetBodyBytes]] as const) {
      const response = await request(path, 'POST', { padding: 'x'.repeat(max + 1) });
      record(path + ' body bound', response.status === 413, { status: response.status, sentPaddingBytes: max + 1, configuredLimit: max });
    }
    const invalidAsset = await request('/api/assets', 'POST', { mint: '0'.repeat(32), kind: 'nft', name: 'Negative', symbol: 'NEG', presetId: 0 });
    record('invalid asset public key rejected', invalidAsset.status === 400 && errorCode(invalidAsset) === 'INVALID_INPUT', { status: invalidAsset.status, code: errorCode(invalidAsset) });
    const invalidFaucet = await request('/api/faucet', 'POST', { publicKey: '0'.repeat(32), requestId: randomUUID() });
    record('invalid faucet key rejected without grant', invalidFaucet.status === 400 && errorCode(invalidFaucet) === 'INVALID_INPUT', { status: invalidFaucet.status, code: errorCode(invalidFaucet) }, 'No valid faucet request was sent.');
    const originFaucet = await request('/api/faucet', 'POST', { publicKey: '11111111111111111111111111111111', requestId: randomUUID() }, { origin: 'https://unapproved.example.test' });
    record('unapproved browser faucet rejected', originFaucet.status === 403 && errorCode(originFaucet) === 'ORIGIN_REJECTED', { status: originFaucet.status, code: errorCode(originFaucet) });
    const gallery = await request('/api/gallery?limit=1'); const entries = gallery.body.entries as GalleryEntry[] | undefined; const entry = entries?.[0];
    if (gallery.status !== 200 || !entry) throw new Error('An actual previously finalized gallery asset is required for replay/forgery controls.');
    const input = { mint: entry.mint, kind: entry.kind, name: entry.name, symbol: entry.symbol, presetId: entry.presetId };
    const replayOne = await request('/api/assets', 'POST', input); const replayTwo = await request('/api/assets', 'POST', input);
    record('existing immutable asset registration is idempotent', replayOne.status === 200 && replayTwo.status === 200 && replayOne.bytesSha256 === replayTwo.bytesSha256 && (replayOne.body as unknown as AssetDocument).contentHash === entry.contentHash, { statuses: [replayOne.status,replayTwo.status], mint: entry.mint, contentHash: entry.contentHash, documentSha256: replayOne.bytesSha256 });
    const immutable = await request('/assets/' + entry.contentHash + '/image.svg', 'GET', undefined, { origin: 'https://unapproved.example.test' });
    record('immutable artwork has bounded browser protections', immutable.status === 200 && immutable.headers['x-content-type-options'] === 'nosniff' && (immutable.headers['content-security-policy'] ?? '').includes("default-src 'none'") && /immutable/.test(immutable.headers['cache-control'] ?? ''), { status: immutable.status, headers: immutable.headers, imageSha256: immutable.bytesSha256 });
    const forged = await request('/api/gallery', 'POST', { mint: entry.mint, contentHash: entry.contentHash, issuanceSignature: encodeBase58(randomBytes(64)) });
    record('unknown finalized issuance receipt cannot enter gallery', forged.status === 409 && errorCode(forged) === 'NOT_FINALIZED', { status: forged.status, code: errorCode(forged) });
    const mismatch = await request('/api/gallery', 'POST', { mint: new PublicKey(randomBytes(32)).toBase58(), contentHash: entry.contentHash, issuanceSignature: entry.issuanceSignature });
    record('gallery rejects mismatched mint/asset identity', mismatch.status === 400 && errorCode(mismatch) === 'ASSET_MISMATCH', { status: mismatch.status, code: errorCode(mismatch) });
    const unchanged = await request('/api/gallery/' + entry.mint);
    record('forged gallery attempts preserve existing issuance proof', unchanged.status === 200 && unchanged.body.issuanceSignature === entry.issuanceSignature && unchanged.body.contentHash === entry.contentHash, { status: unchanged.status, mint: entry.mint, issuanceSignature: unchanged.body.issuanceSignature });
    let denial: Reply | null = null;
    const quotaHour = Math.floor(Date.now() / 3_600_000);
    // At most the published per-IP allowance plus one attempt; no signed
    // transaction/faucet activity, global RPS flood, counter reset, or cap change.
    for (let index = 0; index <= LIMITS.assetsIpHour; index++) {
      if (Math.floor(Date.now() / 3_600_000) !== quotaHour) throw new Error('Asset quota hour changed; bounded admission result is inconclusive.');
      const mint = new PublicKey(randomBytes(32)).toBase58(); quotaRequests++;
      const response = await request('/api/assets', 'POST', { mint, kind: 'nft', name: 'Negative ' + index, symbol: 'NEG', presetId: index % 4 });
      if (response.status === 429) { denial = response; break; }
      if (response.status !== 200) throw new Error('Asset admission probe returned unexpected status ' + response.status);
      createdAssetMints.push(mint);
    }
    record('bounded asset admission returns 429 under unchanged limits', !!denial && errorCode(denial) === 'LIMIT_REACHED', { configuredAssetsPerIpHour: LIMITS.assetsIpHour, quotaHour, requests: quotaRequests, assetsCreated: createdAssetMints.length, status: denial?.status ?? null, code: denial ? errorCode(denial) : null }, 'The public error does not reveal whether the IP or daily global asset bucket denied admission.');
    if (denial) {
      for (const prefix of ['198.51.100.10','203.0.113.5, 198.51.100.99']) {
        const response = await request('/api/assets', 'POST', { mint: new PublicKey(randomBytes(32)).toBase58(), kind: 'nft', name: 'Spoof deny', symbol: 'NEG', presetId: 0 }, { 'x-forwarded-for': prefix, 'x-real-ip': '192.0.2.99', forwarded: 'for=192.0.2.98' });
        record('spoofed forwarded headers do not escape observed quota: ' + prefix, response.status === 429 && errorCode(response) === 'LIMIT_REACHED', { status: response.status, code: errorCode(response) }, 'Remote observation verifies denial continuity; client-IP counter identity is not exposed by the gateway.');
      }
    }
    const final = await request('/api/runtime');
    const runtimeStable = final.status === 200 && ['genesis','sourceCommit','coreSha256','deploymentId','apiBootId','validatorBootId'].every(key => final.body[key] === runtime?.[key]);
    record('runtime identity unchanged during remote negative controls', runtimeStable, { before: runtime, after: final.body });
    const status = await request('/api/status'); record('remote remains online after bounded controls', status.status === 200 && status.body.state === 'online' && status.body.genesisMatches === true, { status: status.status, network: status.body });
    if (freeze) await observeFrozen(freeze);
    const passed = checks.length > 0 && checks.every(check => check.passed);
    evidence('remote-negative-controls', { at: new Date().toISOString(), scope: 'remote actual bounded production gateway negative controls; not a wrong-genesis outage or global-capacity drill', passed, api, web: approvedWeb, genesis, candidate, frozenCandidateBound: candidate !== null, runtime, requests, quotaRequests, createdAssetMints, faucetGrantsRequested: 0, submittedSignedTransactions: 0, unchangedAdmissionLimits: true, checks, limitations: ['Wrong/public-genesis mutation denial, stopped-upstream behavior, upstream response-size/concurrency saturation and daily faucet/global/read quota exhaustion were not exercised against the live master.', 'These requests do not certify unrelated acceptance items. A missing complete frozen candidate prevents G6 binding.', 'Asset quota probes create immutable TEST metadata only and can exhaust this client admission window; no counter was reset.'] });
    console.log(JSON.stringify({ passed, checks: checks.length, failed: checks.filter(check => !check.passed).map(check => check.name), requests, quotaRequests, assetsCreated: createdAssetMints.length, frozenCandidateBound: candidate !== null }));
    if (!passed) process.exitCode = 1;
  } catch (error) {
    evidence('remote-negative-controls', { at: new Date().toISOString(), scope: 'remote actual bounded gateway negative controls; incomplete', passed: false, api, genesis, candidate, runtime, requests, quotaRequests, createdAssetMints, checks, error: error instanceof Error ? error.message : 'Remote controls failed.' }); throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await remoteNegativeControls();
