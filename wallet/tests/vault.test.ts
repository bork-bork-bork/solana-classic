import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { BrowserVault, decryptVault, encryptVault, VAULT_STORAGE_KEY } from '../src/vault';
import { GENESIS } from '../src/display';
const password = 'a long test-only passphrase';
const address = Keypair.generate().publicKey.toBase58();
class MemoryStorage implements Storage {
  values = new Map<string, string>(); fail = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('Quota exceeded'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
}
function exclusiveLocks() {
  let previous = Promise.resolve();
  return { request: (_name: string, _options: unknown, operation: () => Promise<unknown>) => { const next = previous.then(operation); previous = next.then(() => {}, () => {}); return next; } } as unknown as LockManager;
}
test('vault roundtrip uses actual authenticated encryption with fresh salt and IV and no plaintext', async () => {
  const payload = JSON.stringify({ privateTestValue: 'test-payload-must-never-be-stored-plain' });
  const first = await encryptVault(payload, password, address); const second = await encryptVault(payload, password, address);
  assert.equal((await decryptVault(first.record, password)).payload, payload);
  assert.equal(first.key.extractable, false);
  assert.notEqual(JSON.parse(first.record).salt, JSON.parse(second.record).salt);
  assert.notEqual(JSON.parse(first.record).iv, JSON.parse(second.record).iv);
  assert.equal(first.record.includes('test-payload-must-never-be-stored-plain'), false);
  assert.equal(first.record.includes(password), false);
});
test('wrong password, ciphertext or address tamper and wrong network fail closed', async () => {
  const { record } = await encryptVault('private-test-payload', password, address);
  await assert.rejects(decryptVault(record, 'different long test password'), /Unable to unlock/);
  for (const property of ['ciphertext','address'] as const) {
    const changed = JSON.parse(record); changed[property] = property === 'ciphertext' ? (changed.ciphertext[0] === 'A' ? 'B' : 'A') + changed.ciphertext.slice(1) : Keypair.generate().publicKey.toBase58();
    await assert.rejects(decryptVault(JSON.stringify(changed), password));
  }
  const wrong = { ...JSON.parse(record), genesis: 'public-network' }; await assert.rejects(decryptVault(JSON.stringify(wrong), password), /network/);
});
test('vault rejects oversized or corrupt records, weak passwords and unbounded work factors', async () => {
  await assert.rejects(encryptVault('payload', 'short', address), /12 and 128/);
  await assert.rejects(decryptVault('x'.repeat(40_000), password), /too large/);
  await assert.rejects(decryptVault('{', password), /damaged/);
  const { record } = await encryptVault('payload', password, address);
  for (const iterations of [0, 1, 9_999_999_999]) await assert.rejects(decryptVault(JSON.stringify({ ...JSON.parse(record), iterations }), password), /format/);
});
test('saved vault starts locked and commits cannot overwrite another tab journal', async () => {
  const storage = new MemoryStorage(); const locks = exclusiveLocks(); const first = new BrowserVault(storage, locks);
  await first.save('initial', password, address);
  const refreshed = new BrowserVault(storage, locks); assert.equal(refreshed.present(), true); assert.equal(refreshed.unlocked(), false);
  await assert.rejects(refreshed.commit('unsafe'), /Unlock/);
  assert.equal((await refreshed.unlock(password)).payload, 'initial');
  await first.commit('newer pending receipt');
  await assert.rejects(refreshed.commit('stale receipt'), /another tab/);
  assert.equal((await decryptVault(storage.getItem(VAULT_STORAGE_KEY)!, password)).payload, 'newer pending receipt');
  refreshed.lock(); assert.equal((await refreshed.unlock(password)).payload, 'newer pending receipt');
  await assert.rejects(first.save('replacement', password, address), /already exists/);
});
test('simultaneous stale writers serialize and quota failure preserves last encrypted recovery state', async () => {
  const storage = new MemoryStorage(); const locks = exclusiveLocks(); const first = new BrowserVault(storage, locks); const second = new BrowserVault(storage, locks);
  await first.save('original', password, address); await second.unlock(password);
  const results = await Promise.allSettled([first.commit('receipt-one'), second.commit('receipt-two')]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  const raw = storage.getItem(VAULT_STORAGE_KEY)!; storage.fail = true;
  await assert.rejects(first.commit('not-written'), /Quota/); assert.equal(storage.getItem(VAULT_STORAGE_KEY), raw);
  storage.fail = false; await first.remove(); assert.equal(storage.getItem(VAULT_STORAGE_KEY), null); assert.equal(first.unlocked(), false);
});
test('missing exclusive browser coordination refuses saved mode', async () => {
  const vault = new BrowserVault(new MemoryStorage(), {} as LockManager);
  await assert.rejects(vault.save('payload', password, address), /exclusive storage locks/);
});
export { MemoryStorage, exclusiveLocks, password, GENESIS };
