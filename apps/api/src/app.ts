import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ZodError } from 'zod';
import { LIMITS, MEME_SUPPLY, assetInputSchema, faucetInputSchema, galleryInputSchema, rpcInputSchema, type NetworkStatus } from '@solana-classic/config';
import { assertNetwork, verifyAsset, currentNftOwner, verifyPrograms } from '@solana-classic/chain';
import { Store, HttpFailure } from './store.js';
import { loadSettings, type Settings } from './settings.js';
import { runtimeIdentity } from './runtime.js';

export async function createApp(settings: Settings = loadSettings()) {
  const app = Fastify({ bodyLimit: LIMITS.rpcBodyBytes, trustProxy: settings.hosting === 'railway' ? (_address, hop) => hop === 0 : ['127.0.0.1', '::1'], logger: false });
  const store = new Store(settings.dataDir);
  const runtime = runtimeIdentity(settings.network.expectedGenesisHash);
  let activeRpc = 0;
  const boundedFetch: typeof fetch = async (_input, init) => {
    if (activeRpc >= LIMITS.rpcConcurrency) throw new HttpFailure(429, 'UPSTREAM_BUSY', 'RPC concurrency limit reached.');
    activeRpc++;
    try {
      const upstream = await fetch(settings.upstreamUrl, { ...init, signal: AbortSignal.timeout(LIMITS.rpcTimeoutMs) });
      if (!upstream.ok || !upstream.body) throw new HttpFailure(503, 'UPSTREAM_UNAVAILABLE', 'Network RPC is unavailable.');
      const reader = upstream.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      while (true) { const next = await reader.read(); if (next.done) break; bytes += next.value.length; if (bytes > LIMITS.rpcResponseBytes) { await reader.cancel(); throw new HttpFailure(502, 'RESPONSE_BOUND', 'RPC response exceeds the public limit.'); } chunks.push(next.value); }
      return new Response(Buffer.concat(chunks), { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
    } finally { activeRpc--; }
  };
  const connection = new Connection(settings.upstreamUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: boundedFetch });
  let lastSlot: number | null = null; let lastProgress = 0;
  const counters = new Map<string, { until: number; count: number }>();
  const consume = (key: string, max: number, period: number) => {
    const now = Date.now(); const previous = counters.get(key);
    const record = previous && previous.until > now ? previous : { until: now + period, count: 0 };
    if (record.count >= max) throw new HttpFailure(429, 'RATE_LIMITED', 'Too many requests. Wait before trying again.');
    record.count++; counters.set(key, record);
  };
  const cleanCounters = setInterval(() => { for (const [key, value] of counters) if (value.until <= Date.now()) counters.delete(key); }, 60_000); cleanCounters.unref();
  const guard = async () => { await assertNetwork(connection, settings.network.expectedGenesisHash); };
  app.addHook('onRequest', async request => {
    const origin = request.headers.origin;
    if (origin && !request.url.startsWith('/assets/') && !settings.allowedOrigins.includes(origin)) throw new HttpFailure(403, 'ORIGIN_REJECTED', 'This browser origin is not enabled for the experimental network.');
    consume('global', LIMITS.globalRps, 1_000);
    if (request.method !== 'OPTIONS') consume(`read:${request.ip}`, LIMITS.readsPerIpMinute, 60_000);
  });
  await app.register(cors, { origin: settings.allowedOrigins, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'solana-client'], credentials: false, strictPreflight: true });
  app.addHook('onSend', async (request, reply) => { if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store'); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: error.issues.map(x => x.message).join(' ') } });
    const known: Error & { statusCode?: number } = error instanceof Error ? error : new Error('Service unavailable.');
    const status = error instanceof HttpFailure ? error.statusCode : known.statusCode && known.statusCode < 500 ? known.statusCode : 503;
    const message = error instanceof HttpFailure || status < 500 ? known.message : 'The network service could not complete this request. Check status before retrying.';
    return reply.code(status).send({ error: { code: error instanceof HttpFailure ? error.code : 'SERVICE_UNAVAILABLE', message } });
  });
  app.get('/api/network', async () => settings.network);
  app.get('/api/runtime', async () => ({ ...runtime, observedAt: new Date().toISOString() }));
  async function status(): Promise<NetworkStatus> {
    if (!settings.network.expectedGenesisHash) return { state: 'unconfigured', slot: null, genesisMatches: false, lastProgressAt: null, message: 'The experimental network is being prepared.' };
    try {
      await guard(); await verifyPrograms(connection);
      const slot = await connection.getSlot('confirmed');
      if (slot !== lastSlot) { lastSlot = slot; lastProgress = Date.now(); }
      if (Date.now() - lastProgress > 60_000) throw new Error('Slot progression has stopped.');
      return { state: 'online', slot, genesisMatches: true, lastProgressAt: new Date(lastProgress).toISOString(), message: 'Experimental devnet is responding.' };
    } catch { return { state: 'degraded', slot: lastSlot, genesisMatches: false, lastProgressAt: lastProgress ? new Date(lastProgress).toISOString() : null, message: 'Network unavailable. New actions are paused.' }; }
  }
  app.get('/api/status', status);
  app.get('/healthz', async (_request, reply) => { const current = await status(); return reply.code(current.state === 'online' ? 200 : 503).send({ state: current.state }); });
  const probe = setInterval(() => { void status(); }, 30_000); probe.unref();
  app.post('/api/assets', { bodyLimit: LIMITS.assetBodyBytes }, async request => {
    const input = assetInputSchema.parse(request.body); new PublicKey(input.mint); await guard();
    return store.createAsset(input, settings.network.expectedGenesisHash!, settings.assetOrigin, request.ip);
  });
  app.get<{ Params: { hash: string; file: string } }>('/assets/:hash/:file', async (request, reply) => {
    const { hash, file } = request.params;
    if (!/^[a-f0-9]{64}$/.test(hash) || !['image.svg', 'metadata.json'].includes(file) || !store.getAsset(hash)) throw new HttpFailure(404, 'ASSET_NOT_FOUND', 'Asset not found.');
    reply.header('Cache-Control', 'public, max-age=31536000, immutable').header('X-Content-Type-Options', 'nosniff');
    if (file === 'image.svg') reply.type('image/svg+xml').header('Content-Security-Policy', "default-src 'none'; style-src 'none'; sandbox");
    else reply.type('application/json');
    return reply.send(readFileSync(join(store.assetDir, hash, file)));
  });
  app.post('/api/faucet', async request => {
    const input = faucetInputSchema.parse(request.body); const wallet = new PublicKey(input.publicKey); await guard();
    const { receipt, created } = store.reserveFaucet(input.publicKey, request.ip, input.requestId);
    if (!created) {
      if (receipt.signature && ['submitted', 'pending'].includes(receipt.state)) {
        const state = (await connection.getSignatureStatuses([receipt.signature], { searchTransactionHistory: true })).value[0];
        if (state?.err) return store.updateFaucet(input.requestId, 'failed', receipt.signature, 'The recorded grant failed. No second grant was automatically sent.');
        if (state?.confirmationStatus === 'confirmed' || state?.confirmationStatus === 'finalized') return store.updateFaucet(input.requestId, 'confirmed', receipt.signature, '1 TEST grant confirmed.');
      }
      return receipt;
    }
    try {
      const signature = await connection.requestAirdrop(wallet, 1_000_000_000);
      return store.updateFaucet(input.requestId, 'submitted', signature, 'Grant submitted. Wait for its recorded transaction to confirm.');
    } catch {
      return store.updateFaucet(input.requestId, 'uncertain', null, 'The upstream response was interrupted. No second grant will be sent for this request; the operator must reconcile it.');
    }
  });
  app.post('/api/gallery', async request => {
    const input = galleryInputSchema.parse(request.body); await guard();
    const asset = store.getAsset(input.contentHash, settings.network.expectedGenesisHash!);
    if (!asset || asset.mint !== input.mint) throw new HttpFailure(400, 'ASSET_MISMATCH', 'Mint and immutable asset do not match.');
    const transaction = await connection.getParsedTransaction(input.issuanceSignature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
    if (!transaction || !transaction.meta || transaction.meta.err !== null) throw new HttpFailure(409, 'NOT_FINALIZED', 'Issuance is not yet a successful finalised transaction.');
    const expectedAmount = (asset.kind === 'nft' ? 1n : MEME_SUPPLY).toString();
    const minted = transaction.transaction.message.instructions.some(ix => {
      if (!('parsed' in ix) || ix.programId.toBase58() !== settings.network.tokenProgram) return false;
      const parsed = ix.parsed as { type?: string; info?: { mint?: string; amount?: string; tokenAmount?: { amount?: string } } };
      return parsed.info?.mint === input.mint && ((parsed.type === 'mintTo' && parsed.info.amount === expectedAmount) || (parsed.type === 'mintToChecked' && parsed.info.tokenAmount?.amount === expectedAmount));
    });
    if (!minted) throw new HttpFailure(400, 'ISSUANCE_PROOF', 'The supplied transaction does not issue this mint.');
    await verifyAsset(connection, asset);
    store.addGallery(settings.network.expectedGenesisHash!, input.mint, input.contentHash, input.issuanceSignature);
    return store.galleryMint(settings.network.expectedGenesisHash!, input.mint);
  });
  app.get<{ Querystring: { cursor?: string; limit?: string } }>('/api/gallery', async request => {
    const offset = Number(request.query.cursor ?? 0); const limit = Number(request.query.limit ?? 20);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new HttpFailure(400, 'INVALID_PAGINATION', 'Invalid gallery pagination.');
    const rows = store.gallery(settings.network.expectedGenesisHash ?? '', offset, limit + 1);
    return { entries: rows.slice(0, limit), nextCursor: rows.length > limit ? String(offset + limit) : null };
  });
  app.get<{ Params: { mint: string } }>('/api/gallery/:mint', async request => {
    new PublicKey(request.params.mint);
    const entry = store.galleryMint(settings.network.expectedGenesisHash ?? '', request.params.mint);
    if (!entry) throw new HttpFailure(404, 'ASSET_NOT_FOUND', 'Verified asset not found.');
    await guard();
    if (entry.kind === 'meme') return entry;
    const currentOwner = await currentNftOwner(connection, entry.mint);
    return { ...entry, currentOwner, ownershipState: currentOwner ? 'held' : 'burned' };
  });
  app.post('/api/rpc', async (request, reply) => {
    const body = rpcInputSchema.parse(request.body); const params = body.params ?? [];
    if (['getMultipleAccounts', 'getSignatureStatuses'].includes(body.method) && (!Array.isArray(params[0]) || params[0].length > 100)) throw new HttpFailure(400, 'QUERY_BOUND', 'At most 100 accounts or signatures may be queried.');
    if (body.method === 'getMinimumBalanceForRentExemption' && (!Number.isSafeInteger(params[0]) || Number(params[0]) < 0 || Number(params[0]) > 16_384)) throw new HttpFailure(400, 'QUERY_BOUND', 'Rent size is out of bounds.');
    if (['sendTransaction', 'simulateTransaction'].includes(body.method)) {
      if (typeof params[0] !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(params[0])) throw new HttpFailure(400, 'INVALID_TRANSACTION', 'Expected a base64 transaction.');
      const bytes = Buffer.from(params[0], 'base64');
      if (!bytes.length || bytes.length > 1_232) throw new HttpFailure(413, 'TRANSACTION_SIZE', 'Transaction is out of bounds.');
      VersionedTransaction.deserialize(bytes);
      if (body.method === 'sendTransaction') { consume(`send:${request.ip}`, LIMITS.submissionsPerIpMinute, 60_000); await guard(); }
    }
      const upstream = await boundedFetch(settings.upstreamUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const response = await upstream.json() as { jsonrpc?: string; id?: unknown };
      if (response.jsonrpc !== '2.0' || response.id !== body.id) throw new HttpFailure(502, 'UPSTREAM_RESPONSE', 'RPC returned an invalid envelope.');
      return reply.send(response);
  });
  app.addHook('onClose', async () => { clearInterval(probe); clearInterval(cleanCounters); store.close(); });
  return { app, store, connection, settings };
}
