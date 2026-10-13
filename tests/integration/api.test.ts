import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '../../packages/config/src/index';
import { createApp } from '../../apps/api/src/app';
import type { Settings } from '../../apps/api/src/settings';

const genesis = 'local-fixture-genesis';
const wallet = '11111111111111111111111111111111';
const signature = '2'.repeat(88);
const assetInput = { mint: wallet, kind: 'nft' as const, name: 'Fixture Orbit', symbol: 'ORBIT', presetId: 3 };
type RpcEnvelope = { jsonrpc: string; id: string | number; method: string; params?: unknown[] };
type AppContext = Awaited<ReturnType<typeof createApp>>;

describe('API integration (in-process app and mocked upstream; no chain proof)', () => {
  let dataDir: string;
  let settings: Settings;
  let context: AppContext;
  let upstream: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(async () => {
    dataDir = mkdtempSync('/private/tmp/solana-classic-api-fixture-');
    settings = {
      dataDir, assetOrigin: 'https://assets.example.test', allowedOrigins: ['https://web.example.test'], upstreamUrl: 'http://127.0.0.1:8899/', port: 3000,
      network: {
        name: 'Local fixture', mode: 'local', expectedGenesisHash: genesis, denomination: 'TEST', operatorCount: 1, hasMonetaryValue: false,
        tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', resetPolicy: 'Fixture only.',
      },
    };
    upstream = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as RpcEnvelope;
      return Response.json({ jsonrpc: '2.0', id: body.id, result: body.method === 'getGenesisHash' ? genesis : null });
    });
    vi.stubGlobal('fetch', upstream);
    context = await createApp(settings);
    await context.app.ready();
  });
  afterEach(async () => {
    await context.app.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function rpc(method: string, extra: Record<string, unknown> = {}) {
    return { jsonrpc: '2.0', id: 7, method, params: [], ...extra };
  }
  function grantCount() {
    return context.store.db.prepare('SELECT COUNT(*) AS count FROM faucet').get();
  }

  async function useHosting(hosting: 'linux' | 'railway') {
    await context.app.close();
    settings = { ...settings, hosting };
    context = await createApp(settings);
    await context.app.ready();
  }

  it('keys Railway asset quotas by the nearest forwarded client and ignores changing spoofed prefixes', async () => {
    await useHosting('railway');
    const closestClient = '192.0.2.25';
    const createAsset = vi.spyOn(context.store, 'createAsset');
    const prefixes = ['198.51.100.1', '203.0.113.5, 198.51.100.99', 'unknown-prefix'];
    for (const [index, prefix] of prefixes.entries()) {
      const response = await context.app.inject({ method: 'POST', url: '/api/assets', remoteAddress: '10.0.0.8', headers: { 'x-forwarded-for': `${prefix}, ${closestClient}` }, payload: { ...assetInput, name: `Forwarded ${index}` } });
      expect(response.statusCode).toBe(200);
    }
    expect(createAsset.mock.calls.map(call => call[3])).toEqual(prefixes.map(() => closestClient));
    const rows = context.store.db.prepare("SELECT key,count FROM counters WHERE key LIKE 'asset:ip:%'").all();
    expect(rows).toEqual([{ key: `asset:ip:${closestClient}:${Math.floor(Date.now() / 3_600_000)}`, count: prefixes.length }]);
  });

  it('does not let spoofed XFF prefixes escape an exhausted Railway client quota', async () => {
    await useHosting('railway');
    const closestClient = '192.0.2.25';
    const key = `asset:ip:${closestClient}:${Math.floor(Date.now() / 3_600_000)}`;
    context.store.db.prepare('INSERT INTO counters(key,count) VALUES(?,?)').run(key, LIMITS.assetsIpHour);
    for (const prefix of ['198.51.100.1', '203.0.113.2']) {
      const response = await context.app.inject({ method: 'POST', url: '/api/assets', remoteAddress: '10.0.0.8', headers: { 'x-forwarded-for': `${prefix}, ${closestClient}` }, payload: assetInput });
      expect(response.statusCode).toBe(429);
      expect(response.json().error.code).toBe('LIMIT_REACHED');
    }
    expect(context.store.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 0 });
    expect(context.store.db.prepare('SELECT key,count FROM counters').all()).toEqual([{ key, count: LIMITS.assetsIpHour }]);
  });

  it('ignores forwarded headers from a non-loopback peer in Linux hosting mode', async () => {
    await useHosting('linux');
    const createAsset = vi.spyOn(context.store, 'createAsset');
    const response = await context.app.inject({ method: 'POST', url: '/api/assets', remoteAddress: '10.0.0.8', headers: { 'x-forwarded-for': '198.51.100.1, 192.0.2.25' }, payload: assetInput });
    expect(response.statusCode).toBe(200);
    expect(createAsset.mock.calls[0]?.[3]).toBe('10.0.0.8');
  });

  it('returns an unhealthy readiness response when the chain identity is unavailable', async () => {
    vi.spyOn(context.connection, 'getGenesisHash').mockRejectedValue(new Error('Fixture node unavailable'));
    const response = await context.app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ state: 'degraded' });
  });

  it('rejects an unapproved browser origin before reaching upstream or reserving a grant', async () => {
    const response = await context.app.inject({ method: 'POST', url: '/api/faucet', headers: { origin: 'https://unapproved.example.test' }, payload: { publicKey: wallet, requestId: randomUUID() } });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ORIGIN_REJECTED');
    expect(upstream).not.toHaveBeenCalled();
    expect(grantCount()).toEqual({ count: 0 });
  });

  it('answers valid preflight without making a grant or contacting RPC', async () => {
    const response = await context.app.inject({ method: 'OPTIONS', url: '/api/faucet', headers: { origin: settings.allowedOrigins[0]!, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(settings.allowedOrigins[0]);
    expect(upstream).not.toHaveBeenCalled();
    expect(grantCount()).toEqual({ count: 0 });
  });

  it('allows the browser web3.js preflight headers only for the approved origin', async () => {
    const response = await context.app.inject({ method: 'OPTIONS', url: '/api/rpc', headers: {
      origin: settings.allowedOrigins[0]!, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,solana-client',
    } });
    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(settings.allowedOrigins[0]);
    expect(String(response.headers['access-control-allow-headers']).split(',').map(header => header.trim().toLowerCase()).sort()).toEqual(['content-type', 'solana-client']);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(upstream).not.toHaveBeenCalled();
    expect(grantCount()).toEqual({ count: 0 });

    const unapproved = await context.app.inject({ method: 'OPTIONS', url: '/api/rpc', headers: {
      origin: 'https://unapproved.example.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,solana-client',
    } });
    expect(unapproved.statusCode).toBe(403);
    expect(unapproved.headers['access-control-allow-origin']).toBeUndefined();
    expect(upstream).not.toHaveBeenCalled();
  });

  it('keeps extra preflight headers and unsafe HTTP methods outside the browser allowlist', async () => {
    const response = await context.app.inject({ method: 'OPTIONS', url: '/api/rpc', headers: {
      origin: settings.allowedOrigins[0]!, 'access-control-request-method': 'PUT', 'access-control-request-headers': 'content-type,solana-client,authorization,x-upstream-url',
    } });
    expect(response.statusCode).toBe(204);
    expect(String(response.headers['access-control-allow-headers']).split(',').map(header => header.trim().toLowerCase()).sort()).toEqual(['content-type', 'solana-client']);
    expect(String(response.headers['access-control-allow-methods']).split(',').map(method => method.trim()).sort()).toEqual(['GET', 'OPTIONS', 'POST']);
    expect(upstream).not.toHaveBeenCalled();
    expect(grantCount()).toEqual({ count: 0 });
  });

  it('forwards allowlisted readonly getVersion from the browser SDK to the fixed upstream without a grant', async () => {
    const payload = rpc('getVersion');
    const envelope = { jsonrpc: '2.0', id: payload.id, result: { 'solana-core': '4.3.0-fixture', 'feature-set': 123 } };
    upstream.mockResolvedValue(Response.json(envelope));
    const response = await context.app.inject({ method: 'POST', url: '/api/rpc', headers: { origin: settings.allowedOrigins[0]!, 'solana-client': 'js/1.99.0' }, payload });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(envelope);
    expect(response.headers['access-control-allow-origin']).toBe(settings.allowedOrigins[0]);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0]?.[0]).toBe(settings.upstreamUrl);
    expect(JSON.parse(String(upstream.mock.calls[0]?.[1]?.body))).toEqual(payload);
    expect(grantCount()).toEqual({ count: 0 });
  });

  it.each(['requestAirdrop', 'validatorExit', 'setLogFilter', 'getProgramAccounts'])('rejects non-allowlisted raw RPC method %s', async method => {
    const response = await context.app.inject({ method: 'POST', url: '/api/rpc', payload: rpc(method) });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_INPUT');
    expect(upstream).not.toHaveBeenCalled();
    expect(grantCount()).toEqual({ count: 0 });
  });

  it.each([
    [rpc('getGenesisHash'), rpc('getHealth')],
    rpc('getGenesisHash', { url: 'https://arbitrary-upstream.example.test' }),
    rpc('getGenesisHash', { upstream: 'https://arbitrary-upstream.example.test' }),
  ])('rejects batch or caller-selected upstream payload %#', async payload => {
    const response = await context.app.inject({ method: 'POST', url: '/api/rpc', payload });
    expect(response.statusCode).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('forwards a valid JSON-RPC transaction error without presenting it as a successful result', async () => {
    const envelope = { jsonrpc: '2.0', id: 7, error: { code: -32002, message: 'Fixture transaction rejected', data: { err: 'AccountNotFound' } } };
    upstream.mockResolvedValue(Response.json(envelope));
    const response = await context.app.inject({ method: 'POST', url: '/api/rpc', payload: rpc('getHealth') });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(envelope);
    expect(response.json()).not.toHaveProperty('result');
  });

  it.each([
    { url: '/api/rpc', max: LIMITS.rpcBodyBytes },
    { url: '/api/assets', max: LIMITS.assetBodyBytes },
  ])('rejects oversized $url input before reaching upstream', async ({ url, max }) => {
    const response = await context.app.inject({ method: 'POST', url, payload: { padding: 'x'.repeat(max + 1) } });
    expect(response.statusCode).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['another-private-genesis', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'])('disables faucet and asset mutations on wrong/public genesis %s', async actualGenesis => {
    vi.spyOn(context.connection, 'getGenesisHash').mockResolvedValue(actualGenesis);
    const airdrop = vi.spyOn(context.connection, 'requestAirdrop');
    const faucet = await context.app.inject({ method: 'POST', url: '/api/faucet', payload: { publicKey: wallet, requestId: randomUUID() } });
    const asset = await context.app.inject({ method: 'POST', url: '/api/assets', payload: assetInput });
    // A structurally valid legacy transaction fixture with one blank signature/account/blockhash.
    const transaction = Buffer.concat([Buffer.from([1]), Buffer.alloc(64), Buffer.from([1, 0, 0, 1]), Buffer.alloc(64), Buffer.from([0])]).toString('base64');
    const send = await context.app.inject({ method: 'POST', url: '/api/rpc', payload: rpc('sendTransaction', { params: [transaction, { encoding: 'base64' }] }) });
    expect(faucet.statusCode).toBe(503);
    expect(asset.statusCode).toBe(503);
    expect(send.statusCode).toBe(503);
    expect(airdrop).not.toHaveBeenCalled();
    expect(upstream).not.toHaveBeenCalled();
    expect(grantCount()).toEqual({ count: 0 });
    expect(context.store.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 0 });
  });

  it('keeps one uncertain grant on duplicate retry and process restart after an upstream timeout', async () => {
    const airdrop = vi.spyOn(context.connection, 'requestAirdrop').mockRejectedValue(new Error('fixture response timeout'));
    const payload = { publicKey: wallet, requestId: randomUUID() };
    const first = await context.app.inject({ method: 'POST', url: '/api/faucet', payload });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ requestId: payload.requestId, state: 'uncertain', signature: null });
    const retry = await context.app.inject({ method: 'POST', url: '/api/faucet', payload });
    expect(retry.json()).toEqual(first.json());
    expect(airdrop).toHaveBeenCalledTimes(1);
    expect(grantCount()).toEqual({ count: 1 });
    await context.app.close();
    context = await createApp(settings);
    await context.app.ready();
    const restartedAirdrop = vi.spyOn(context.connection, 'requestAirdrop');
    const restarted = await context.app.inject({ method: 'POST', url: '/api/faucet', payload });
    expect(restarted.json()).toEqual(first.json());
    expect(restartedAirdrop).not.toHaveBeenCalled();
    expect(grantCount()).toEqual({ count: 1 });
  });

  it('shares concurrency admission between proxy traffic and mutation identity guards until upstream bodies finish', async () => {
    const waiting: { controller: ReadableStreamDefaultController<Uint8Array>; id: RpcEnvelope['id'] }[] = [];
    upstream.mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as RpcEnvelope;
      // If admission regresses, overflow requests complete so the test can fail without hanging.
      if (waiting.length >= LIMITS.rpcConcurrency) return Response.json({ jsonrpc: '2.0', id: body.id, result: body.method === 'getGenesisHash' ? genesis : 'ok' });
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { waiting.push({ controller, id: body.id }); } }));
    });
    const pending = Array.from({ length: LIMITS.rpcConcurrency }, (_, id) => context.app.inject({ method: 'POST', url: '/api/rpc', payload: rpc('getHealth', { id }) }));
    // inject's thenable starts when awaited; attach handlers before waiting for admission.
    const completed = Promise.all(pending.map(request => Promise.resolve(request)));
    try {
      await vi.waitFor(() => expect(waiting).toHaveLength(LIMITS.rpcConcurrency));
      const overflow = await context.app.inject({ method: 'POST', url: '/api/rpc', payload: rpc('getHealth') });
      const guarded = await context.app.inject({ method: 'POST', url: '/api/assets', payload: assetInput });
      expect(overflow.statusCode).toBe(429);
      expect(guarded.statusCode).toBe(429);
      expect(upstream).toHaveBeenCalledTimes(LIMITS.rpcConcurrency);
      expect(context.store.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 0 });
    } finally {
      for (const { controller, id } of waiting) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id, result: 'ok' })));
        controller.close();
      }
      await completed;
    }
    expect((await completed).every(response => response.statusCode === 200)).toBe(true);
    upstream.mockResolvedValue(Response.json({ jsonrpc: '2.0', id: 7, result: 'ok' }));
    expect((await context.app.inject({ method: 'POST', url: '/api/rpc', payload: rpc('getHealth') })).statusCode).toBe(200);
  });

  it.each(['/api/rpc', '/api/assets'])('bounds upstream bytes for %s including identity calls', async url => {
    const cancel = vi.fn();
    upstream.mockImplementation(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(LIMITS.rpcResponseBytes + 1)); }, cancel,
    })));
    const response = await context.app.inject({ method: 'POST', url, payload: url === '/api/rpc' ? rpc('getHealth') : assetInput });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('RESPONSE_BOUND');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    { meta: null, amount: '1', type: 'mintTo', status: 409, code: 'NOT_FINALIZED' },
    { meta: { err: null }, amount: '0', type: 'mintTo', status: 400, code: 'ISSUANCE_PROOF' },
    { meta: { err: null }, amount: '0', type: 'mintToChecked', status: 400, code: 'ISSUANCE_PROOF' },
  ])('rejects gallery proof with $type amount=$amount and absent/invalid success evidence', async fixture => {
    const asset = context.store.createAsset(assetInput, genesis, settings.assetOrigin, '192.0.2.1');
    const proof = {
      meta: fixture.meta,
      transaction: { message: { instructions: [{ programId: { toBase58: () => settings.network.tokenProgram }, parsed: { type: fixture.type, info: { mint: wallet, amount: fixture.amount, tokenAmount: { amount: fixture.amount } } } }] } },
    };
    vi.spyOn(context.connection, 'getParsedTransaction').mockResolvedValue(proof as unknown as Awaited<ReturnType<typeof context.connection.getParsedTransaction>>);
    const response = await context.app.inject({ method: 'POST', url: '/api/gallery', payload: { mint: wallet, issuanceSignature: signature, contentHash: asset.contentHash } });
    expect(response.statusCode).toBe(fixture.status);
    expect(response.json().error.code).toBe(fixture.code);
    expect(context.store.gallery(genesis, 0, 10)).toEqual([]);
    expect(upstream).toHaveBeenCalledTimes(1); // Genesis guard only; final mint verification was never reached.
  });
});
