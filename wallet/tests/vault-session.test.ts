import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { TestSession } from '../src/session';
import { BrowserVault, VAULT_STORAGE_KEY, toBase64 } from '../src/vault';
import { API, GENESIS } from '../src/display';
const password = 'a long disposable test password';
class Store implements Storage {
  items = new Map<string,string>(); fail = false;
  get length() { return this.items.size; } clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('Quota exceeded'); this.items.set(key, value); }
  removeItem(key: string) { this.items.delete(key); } key(i: number) { return [...this.items.keys()][i] ?? null; }
}
let queue = Promise.resolve();
const locks = { request: (_name: string, _options: unknown, operation: () => Promise<unknown>) => { const next = queue.then(operation); queue = next.then(() => {}, () => {}); return next; } } as unknown as LockManager;
const storage = new Store();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
const identity = { state: 'online' as const, slot: 1, genesisMatches: true, lastProgressAt: null, message: 'Mock identity' };
function mocked(session: TestSession) {
  session.verify = async () => identity;
  session.connection.getLatestBlockhash = async () => ({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 999999 });
  session.connection.getBalance = async () => 1_000_000_000;
  session.connection.getFeeForMessage = async () => ({ context: { slot: 1 }, value: 5000 });
  session.connection.simulateTransaction = (async () => ({ context: { slot: 1 }, value: { err: null, logs: [] } })) as typeof session.connection.simulateTransaction;
}
test('saved session restores the exact generated address and invalidates old reviews on lock', async () => {
  storage.clear(); const session = new TestSession(); const address = session.create(); mocked(session);
  const plan = await session.plan(Keypair.generate().publicKey.toBase58(), '0.01');
  await session.saveWallet(password); session.lockWallet(); assert.equal(session.address(), '');
  await assert.rejects(session.unlockWallet('incorrect long test password')); assert.equal(session.address(), '');
  assert.equal(await session.unlockWallet(password), address);
  await assert.rejects(session.send(plan, () => {}), /fresh transfer review/);
  const refreshed = new TestSession(); assert.equal(refreshed.hasSavedWallet(), true); assert.equal(refreshed.address(), '');
  assert.throws(() => refreshed.create(), /Unlock/); assert.equal(await refreshed.unlockWallet(password), address);
});
test('encrypted transfer receipt exists before attempted broadcast and survives refresh without a resend', async () => {
  storage.clear(); const session = new TestSession(); const address = session.create(); mocked(session); await session.saveWallet(password);
  const plan = await session.plan(Keypair.generate().publicKey.toBase58(), '0.01'); let attempts = 0; let journal = '';
  session.connection.sendRawTransaction = async () => { attempts++; const view = new BrowserVault(storage, locks); const payload = JSON.parse((await view.unlock(password)).payload); journal = payload.send; assert.equal(payload.genesis.length > 0, true); assert.equal(payload.send.length > 70, true); throw new Error('Mock broadcast timeout'); };
  await assert.rejects(session.send(plan, () => {}), /Mock broadcast timeout/); assert.equal(attempts, 1);
  const refreshed = new TestSession(); mocked(refreshed); assert.equal(await refreshed.unlockWallet(password), address);
  await assert.rejects(refreshed.plan(Keypair.generate().publicKey.toBase58(), '0.01'), /awaiting confirmation/);
  const snapshot = JSON.parse((await new BrowserVault(storage, locks).unlock(password)).payload); assert.equal(snapshot.send, journal);
  await assert.rejects(refreshed.removeSavedWallet(), /pending/); assert.equal(attempts, 1);
});
test('quota failure prevents broadcast and retains prior encrypted wallet copy', async () => {
  storage.clear(); const session = new TestSession(); session.create(); mocked(session); await session.saveWallet(password);
  const before = storage.getItem(VAULT_STORAGE_KEY); const plan = await session.plan(Keypair.generate().publicKey.toBase58(), '0.01'); let attempts = 0;
  session.connection.sendRawTransaction = async () => { attempts++; throw new Error('Unexpected broadcast'); };
  storage.fail = true; await assert.rejects(session.send(plan, () => {}), /Quota/); storage.fail = false;
  assert.equal(attempts, 0); assert.equal(storage.getItem(VAULT_STORAGE_KEY), before);
});
test('faucet retry identity is encrypted before a request and restored after reload', async () => {
  storage.clear(); const session = new TestSession(); session.create(); mocked(session); await session.saveWallet(password);
  const original = globalThis.fetch; let requestId = '';
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init!.body as string); const state = JSON.parse((await new BrowserVault(storage, locks).unlock(password)).payload);
    assert.equal(state.faucet, body.requestId); if (!requestId) requestId = body.requestId; else assert.equal(body.requestId, requestId);
    throw new Error('Mock faucet timeout');
  };
  try {
    await assert.rejects(session.claim(), /Mock faucet timeout/);
    const refreshed = new TestSession(); mocked(refreshed); await refreshed.unlockWallet(password);
    await assert.rejects(refreshed.claim(), /Mock faucet timeout/);
  } finally { globalThis.fetch = original; }
});

test('saved pending creation restores its receipt and cannot silently mint again', async () => {
  storage.clear(); const key = Keypair.generate(); const address = key.publicKey.toBase58(); const hash = 'a'.repeat(64);
  const document = { mint: Keypair.generate().publicKey.toBase58(), kind: 'nft', name: 'Recovery Test', symbol: 'RCV', presetId: 1, contentHash: hash, uri: API + '/assets/' + hash + '/metadata.json', image: API + '/assets/' + hash + '/image.svg' };
  const receipt = '4'.repeat(88);
  const state = { version: 1, genesis: GENESIS, secret: toBase64(key.secretKey), faucet: null, send: null, creation: { plan: { document, sender: address, fee: 5000, rent: 1, units: '1' }, signature: receipt } };
  await new BrowserVault(storage, locks).save(JSON.stringify(state), password, address);
  const session = new TestSession(); mocked(session); assert.equal(await session.unlockWallet(password), address); assert.equal(session.hasPendingCreation(), true);
  await assert.rejects(session.prepareCreation({ kind: 'nft', name: 'Second', symbol: 'TWO', presetId: 1 }), /pending transaction/);
  let reads = 0; let sends = 0;
  session.connection.getSignatureStatuses = async signatures => { reads++; assert.deepEqual(signatures, [receipt]); throw new Error('Mock finalization not yet available'); };
  session.connection.sendRawTransaction = async () => { sends++; throw new Error('Unexpected second mint'); };
  await assert.rejects(session.resumeCreation(), /Mock finalization/); assert.equal(reads, 1); assert.equal(sends, 0); assert.equal(session.hasPendingCreation(), true);
  await assert.rejects(session.removeSavedWallet(), /pending/);
});
