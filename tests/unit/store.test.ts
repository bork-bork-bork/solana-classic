import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, TEST_LAMPORTS, type AssetInput } from '../../packages/config/src/index';
import { Store } from '../../apps/api/src/store';

const now = Date.UTC(2026, 9, 13, 12);
const day = '2026-10-13';
const genesis = 'private-experimental-genesis';
const origin = 'https://assets.example.test';
const wallet = '11111111111111111111111111111111';
const ip = '192.0.2.1';
const input: AssetInput = { mint: wallet, kind: 'nft', name: 'Test Orbit', symbol: 'ORBIT', presetId: 3 };

describe('persistent Store accounting (local SQLite only)', () => {
  let dataDir: string;
  let store: Store;
  const opened: Store[] = [];

  beforeEach(() => {
    dataDir = mkdtempSync('/private/tmp/solana-classic-unit-');
    store = new Store(dataDir);
    opened.push(store);
  });
  afterEach(() => {
    for (const instance of opened.splice(0)) if (instance.db.open) instance.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function counters() {
    return store.db.prepare('SELECT key,count FROM counters ORDER BY key').all();
  }
  function setCounter(key: string, count: number) {
    store.db.prepare('INSERT INTO counters(key,count) VALUES(?,?)').run(key, count);
  }
  function reopen() {
    store.close();
    store = new Store(dataDir);
    opened.push(store);
  }

  it('retains uncertain receipts across restart and retries without consuming another grant', () => {
    const requestId = randomUUID();
    expect(store.reserveFaucet(wallet, ip, requestId, now)).toMatchObject({
      created: true, receipt: { requestId, state: 'pending', signature: null, lamports: TEST_LAMPORTS },
    });
    const signature = 'a-local-submitted-signature';
    store.updateFaucet(requestId, 'submitted', signature, 'Submitted before the response timed out.');
    store.updateFaucet(requestId, 'uncertain', signature, 'Confirmation timed out; inspect this receipt.');
    const consumed = counters();
    reopen();
    const retry = store.reserveFaucet(wallet, '192.0.2.2', requestId, now + 86_400_000);
    expect(retry).toMatchObject({ created: false, receipt: { requestId, state: 'uncertain', signature } });
    expect(counters()).toEqual(consumed);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM faucet').get()).toEqual({ count: 1 });
  });

  it('retains pending reservation after a restart before broadcasting', () => {
    const requestId = randomUUID();
    const reservation = store.reserveFaucet(wallet, ip, requestId, now);
    reopen();
    expect(store.reserveFaucet(wallet, ip, requestId, now)).toEqual({ ...reservation, created: false });
    expect(counters()).toHaveLength(3);
    expect(counters()).toEqual(expect.arrayContaining([
      { key: `faucet:wallet:${wallet}:${day}`, count: 1 },
      { key: `faucet:ip:${ip}:${day}`, count: 1 },
      { key: `faucet:global:${day}`, count: 1 },
    ]));
  });

  it('rejects request-ID reuse by a different wallet without changing its receipt or counters', () => {
    const requestId = randomUUID();
    const receipt = store.reserveFaucet(wallet, ip, requestId, now).receipt;
    const consumed = counters();
    expect(() => store.reserveFaucet('22222222222222222222222222222222', ip, requestId, now)).toThrow(expect.objectContaining({ statusCode: 409, code: 'REQUEST_CONFLICT' }));
    expect(counters()).toEqual(consumed);
    expect(store.reserveFaucet(wallet, ip, requestId, now).receipt).toEqual(receipt);
  });

  it('enforces the wallet daily cap across independent database connections and restart', () => {
    const second = new Store(dataDir);
    opened.push(second);
    for (let index = 0; index < LIMITS.faucetWalletDay; index++) {
      const connection = index % 2 === 0 ? store : second;
      expect(connection.reserveFaucet(wallet, ip, randomUUID(), now).created).toBe(true);
    }
    const consumed = counters();
    reopen();
    expect(() => store.reserveFaucet(wallet, ip, randomUUID(), now)).toThrow(expect.objectContaining({ statusCode: 429, code: 'LIMIT_REACHED' }));
    expect(counters()).toEqual(consumed);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM faucet').get()).toEqual({ count: LIMITS.faucetWalletDay });
    expect(store.reserveFaucet(wallet, ip, randomUUID(), now + 86_400_000).created).toBe(true);
  });

  it.each(['ip', 'global'] as const)('rolls back earlier faucet counter increments when the %s cap rejects a reservation', scope => {
    const key = scope === 'ip' ? `faucet:ip:${ip}:${day}` : `faucet:global:${day}`;
    setCounter(key, scope === 'ip' ? LIMITS.faucetIpDay : LIMITS.faucetGlobalDay);
    const consumed = counters();
    expect(() => store.reserveFaucet(wallet, ip, randomUUID(), now)).toThrow(expect.objectContaining({ code: 'LIMIT_REACHED' }));
    expect(counters()).toEqual(consumed);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM faucet').get()).toEqual({ count: 0 });
  });

  it('returns identical immutable assets after restart without spending another quota or storage allocation', () => {
    const document = store.createAsset(input, genesis, origin, ip, now);
    const metadataPath = join(store.assetDir, document.contentHash, 'metadata.json');
    const metadata = readFileSync(metadataPath, 'utf8');
    store.db.prepare('UPDATE counters SET count=? WHERE key=?').run(LIMITS.assetsIpHour, `asset:ip:${ip}:${Math.floor(now / 3_600_000)}`);
    store.db.prepare('UPDATE counters SET count=? WHERE key=?').run(LIMITS.assetsGlobalDay, `asset:global:${day}`);
    const consumed = counters();
    const allocated = store.db.prepare('SELECT SUM(bytes) AS bytes FROM assets').get();
    reopen();
    expect(store.createAsset(input, genesis, 'https://changed-origin.example.test', '192.0.2.2', now + 86_400_000)).toEqual(document);
    expect(readFileSync(metadataPath, 'utf8')).toBe(metadata);
    expect(counters()).toEqual(consumed);
    expect(store.db.prepare('SELECT SUM(bytes) AS bytes FROM assets').get()).toEqual(allocated);
    expect(store.getAsset(document.contentHash, 'another-genesis')).toBeNull();
    expect(store.getAsset(document.contentHash, genesis)).toEqual(document);
  });

  it.each(['ip', 'global'] as const)('rejects asset %s quota exhaustion without recording files, assets or partial counters', scope => {
    const key = scope === 'ip' ? `asset:ip:${ip}:${Math.floor(now / 3_600_000)}` : `asset:global:${day}`;
    setCounter(key, scope === 'ip' ? LIMITS.assetsIpHour : LIMITS.assetsGlobalDay);
    const consumed = counters();
    expect(() => store.createAsset(input, genesis, origin, ip, now)).toThrow(expect.objectContaining({ code: 'LIMIT_REACHED' }));
    expect(counters()).toEqual(consumed);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 0 });
    const hash = createHash('sha256').update(JSON.stringify({ version: 1, genesis, ...input })).digest('hex');
    expect(existsSync(join(store.assetDir, hash))).toBe(false);
  });

  it('rolls back asset counters and registry rows when an existing immutable file conflicts', () => {
    const hash = createHash('sha256').update(JSON.stringify({ version: 1, genesis, ...input })).digest('hex');
    const dir = join(store.assetDir, hash);
    mkdirSync(dir);
    writeFileSync(join(dir, 'image.svg'), 'tampered immutable image');
    expect(() => store.createAsset(input, genesis, origin, ip, now)).toThrow(expect.objectContaining({ statusCode: 503, code: 'ASSET_INTEGRITY' }));
    expect(counters()).toEqual([]);
    expect(store.getAsset(hash)).toBeNull();
    expect(existsSync(join(dir, 'metadata.json'))).toBe(false);
  });

  it('rolls back quotas after a registry insertion failure and charges one allocation on a successful retry', () => {
    store.db.exec("CREATE TRIGGER reject_asset_insert BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT, 'injected registry failure'); END;");
    expect(() => store.createAsset(input, genesis, origin, ip, now)).toThrow('injected registry failure');
    expect(counters()).toEqual([]);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 0 });
    const hash = createHash('sha256').update(JSON.stringify({ version: 1, genesis, ...input })).digest('hex');
    expect(existsSync(join(store.assetDir, hash, 'image.svg'))).toBe(false);
    expect(existsSync(join(store.assetDir, hash, 'metadata.json'))).toBe(false);
    store.db.exec('DROP TRIGGER reject_asset_insert');
    const document = store.createAsset(input, genesis, origin, ip, now);
    expect(store.getAsset(document.contentHash, genesis)).toEqual(document);
    expect(counters()).toEqual(expect.arrayContaining([
      { key: `asset:ip:${ip}:${Math.floor(now / 3_600_000)}`, count: 1 },
      { key: `asset:global:${day}`, count: 1 },
    ]));
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 1 });
  });

  it('counts orphan files at startup and rejects exhausted physical storage before consuming asset quotas', () => {
    const orphan = join(store.assetDir, 'orphan-from-interrupted-write');
    writeFileSync(orphan, '');
    truncateSync(orphan, LIMITS.assetStorageBytes);
    reopen();
    expect(() => store.createAsset(input, genesis, origin, ip, now)).toThrow(expect.objectContaining({ statusCode: 507, code: 'ASSET_STORAGE_FULL' }));
    expect(counters()).toEqual([]);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 0 });
  });

  it('refreshes physical storage accounting in the next hour before admitting a new asset', () => {
    store.createAsset(input, genesis, origin, ip, now);
    const orphan = join(store.assetDir, 'late-orphan');
    writeFileSync(orphan, '');
    truncateSync(orphan, LIMITS.assetStorageBytes);
    const consumed = counters();
    expect(() => store.createAsset({ ...input, name: 'Next Asset' }, genesis, origin, ip, now + 3_600_000)).toThrow(expect.objectContaining({ code: 'ASSET_STORAGE_FULL' }));
    expect(counters()).toEqual(consumed);
    expect(store.db.prepare('SELECT COUNT(*) AS count FROM assets').get()).toEqual({ count: 1 });
  });

  it('prunes expired quota counters while retaining durable faucet request IDs', () => {
    const requestId = randomUUID();
    const receipt = store.reserveFaucet(wallet, ip, requestId, now).receipt;
    store.createAsset(input, genesis, origin, ip, now);
    const later = now + 4 * 86_400_000;
    store.reserveFaucet(wallet, ip, randomUUID(), later);
    expect(counters()).toHaveLength(3);
    expect(counters()).toEqual(expect.arrayContaining([
      { key: `faucet:wallet:${wallet}:2026-10-17`, count: 1 },
      { key: `faucet:ip:${ip}:2026-10-17`, count: 1 },
      { key: 'faucet:global:2026-10-17', count: 1 },
    ]));
    const consumed = counters();
    expect(store.reserveFaucet(wallet, ip, requestId, later)).toEqual({ receipt, created: false });
    expect(counters()).toEqual(consumed);
  });
});
