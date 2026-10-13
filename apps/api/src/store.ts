import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, lstatSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LIMITS, presetSvg, type AssetInput, type AssetDocument, type FaucetReceipt, type GalleryEntry } from '@solana-classic/config';

export class HttpFailure extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
type AssetRow = { hash: string; genesis: string; mint: string; document: string; bytes: number };
type FaucetRow = { request_id: string; wallet: string; ip: string; day: string; state: FaucetReceipt['state']; signature: string | null; message: string };
export class Store {
  readonly db: Database.Database;
  readonly assetDir: string;
  private assetBytesOnDisk = 0;
  private maintenanceHour = -1;
  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 }); this.assetDir = join(dataDir, 'assets'); mkdirSync(this.assetDir, { recursive: true });
    this.db = new Database(join(dataDir, 'app.sqlite')); this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON'); this.db.pragma('busy_timeout = 5000');
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    this.db.pragma(`max_page_count = ${Math.floor(LIMITS.databaseBytes / pageSize)}`);
    this.db.pragma('wal_autocheckpoint = 1000');
    this.assetBytesOnDisk = this.diskBytes(this.assetDir);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS assets (hash TEXT PRIMARY KEY, genesis TEXT NOT NULL, mint TEXT NOT NULL, document TEXT NOT NULL, bytes INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS faucet (request_id TEXT PRIMARY KEY, wallet TEXT NOT NULL, ip TEXT NOT NULL, day TEXT NOT NULL, state TEXT NOT NULL, signature TEXT, message TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS gallery (genesis TEXT NOT NULL, mint TEXT NOT NULL, asset_hash TEXT NOT NULL REFERENCES assets(hash), signature TEXT NOT NULL, verified_at TEXT NOT NULL, PRIMARY KEY(genesis,mint));
    `);
  }
  private diskBytes(path: string): number {
    return readdirSync(path).reduce((total, name) => { const full = join(path, name); const stat = lstatSync(full); return total + (stat.isDirectory() ? this.diskBytes(full) : stat.size); }, 0);
  }
  private maintainCounters(now: number) {
    const hour = Math.floor(now / 3_600_000);
    if (hour === this.maintenanceHour) return;
    this.maintenanceHour = hour;
    const cutoff = new Date(now - 3 * 86_400_000).toISOString().slice(0, 10);
    for (const { key } of this.db.prepare('SELECT key FROM counters').all() as { key: string }[]) {
      if ((key.startsWith('asset:ip:') && Number(key.slice(key.lastIndexOf(':') + 1)) < hour - 72) || ((key.startsWith('faucet:') || key.startsWith('asset:global:')) && key.slice(-10) < cutoff)) this.db.prepare('DELETE FROM counters WHERE key=?').run(key);
    }
    this.assetBytesOnDisk = this.diskBytes(this.assetDir);
  }
  private consume(key: string, max: number) {
    const row = this.db.prepare('SELECT count FROM counters WHERE key=?').get(key) as { count: number } | undefined;
    if ((row?.count ?? 0) >= max) throw new HttpFailure(429, 'LIMIT_REACHED', 'The test service limit has been reached. Try again after the current window.');
    this.db.prepare('INSERT INTO counters(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key);
  }
  createAsset(input: AssetInput, genesis: string, origin: string, ip: string, now = Date.now()): AssetDocument {
    const seed = JSON.stringify({ version: 1, genesis, ...input });
    const hash = createHash('sha256').update(seed).digest('hex');
    const newFiles: string[] = [];
    try { return this.db.transaction(() => {
      this.maintainCounters(now);
      const prior = this.db.prepare('SELECT * FROM assets WHERE hash=?').get(hash) as AssetRow | undefined;
      if (prior) return JSON.parse(prior.document) as AssetDocument;
      const document: AssetDocument = { ...input, contentHash: hash, uri: `${origin}/assets/${hash}/metadata.json`, image: `${origin}/assets/${hash}/image.svg` };
      const image = presetSvg(input.presetId);
      const metadata = JSON.stringify({ name: input.name, symbol: input.symbol, description: 'Original geometric art on the Solana Classic experimental devnet. No monetary value or future conversion entitlement.', image: document.image, attributes: [{ trait_type: 'Preset', value: input.presetId }, { trait_type: 'Network', value: 'Experimental devnet' }], properties: { files: [{ uri: document.image, type: 'image/svg+xml' }] } });
      const bytes = Buffer.byteLength(image) + Buffer.byteLength(metadata);
      if (bytes > LIMITS.assetFileBytes) throw new HttpFailure(413, 'ASSET_TOO_LARGE', 'Generated asset exceeds the storage limit.');
      const dir = join(this.assetDir, hash);
      const additionalBytes = (existsSync(join(dir, 'image.svg')) ? 0 : Buffer.byteLength(image)) + (existsSync(join(dir, 'metadata.json')) ? 0 : Buffer.byteLength(metadata));
      if (this.assetBytesOnDisk + additionalBytes > LIMITS.assetStorageBytes) throw new HttpFailure(507, 'ASSET_STORAGE_FULL', 'Asset storage is full; new creation is paused.');
      this.consume(`asset:ip:${ip}:${Math.floor(now / 3_600_000)}`, LIMITS.assetsIpHour);
      this.consume(`asset:global:${new Date(now).toISOString().slice(0, 10)}`, LIMITS.assetsGlobalDay);
      mkdirSync(dir, { recursive: true });
      for (const [name, body] of [['image.svg', image], ['metadata.json', metadata]]) {
        const path = join(dir, name!);
        if (existsSync(path)) { if (readFileSync(path, 'utf8') !== body) throw new HttpFailure(503, 'ASSET_INTEGRITY', 'Stored immutable asset differs from its content identity.'); }
        else { writeFileSync(path, body!, { flag: 'wx', mode: 0o644 }); newFiles.push(path); this.assetBytesOnDisk += Buffer.byteLength(body!); }
      }
      this.db.prepare('INSERT INTO assets VALUES(?,?,?,?,?)').run(hash, genesis, input.mint, JSON.stringify(document), bytes);
      return document;
    }).immediate(); } catch (error) {
      for (const path of newFiles) { try { const size = lstatSync(path).size; unlinkSync(path); this.assetBytesOnDisk -= size; } catch { /* Count a file that could not be removed; do not let retries escape the cap. */ } }
      throw error;
    }
  }
  getAsset(hash: string, genesis?: string): AssetDocument | null {
    const row = this.db.prepare('SELECT * FROM assets WHERE hash=?').get(hash) as AssetRow | undefined;
    if (!row || (genesis && row.genesis !== genesis)) return null;
    return JSON.parse(row.document) as AssetDocument;
  }
  reserveFaucet(wallet: string, ip: string, requestId: string, now = Date.now()): { receipt: FaucetReceipt; created: boolean } {
    return this.db.transaction(() => {
      this.maintainCounters(now);
      const prior = this.db.prepare('SELECT * FROM faucet WHERE request_id=?').get(requestId) as FaucetRow | undefined;
      if (prior) { if (prior.wallet !== wallet) throw new HttpFailure(409, 'REQUEST_CONFLICT', 'This request belongs to another wallet.'); return { receipt: this.toReceipt(prior), created: false }; }
      const day = new Date(now).toISOString().slice(0, 10);
      this.consume(`faucet:wallet:${wallet}:${day}`, LIMITS.faucetWalletDay); this.consume(`faucet:ip:${ip}:${day}`, LIMITS.faucetIpDay); this.consume(`faucet:global:${day}`, LIMITS.faucetGlobalDay);
      this.db.prepare('INSERT INTO faucet(request_id,wallet,ip,day,state,signature,message) VALUES(?,?,?,?,?,?,?)').run(requestId, wallet, ip, day, 'pending', null, 'Grant reserved. Do not request another grant while this one is pending.');
      return { receipt: this.toReceipt(this.db.prepare('SELECT * FROM faucet WHERE request_id=?').get(requestId) as FaucetRow), created: true };
    }).immediate();
  }
  updateFaucet(requestId: string, state: FaucetReceipt['state'], signature: string | null, message: string): FaucetReceipt {
    this.db.prepare('UPDATE faucet SET state=?,signature=?,message=? WHERE request_id=?').run(state, signature, message, requestId);
    return this.toReceipt(this.db.prepare('SELECT * FROM faucet WHERE request_id=?').get(requestId) as FaucetRow);
  }
  private toReceipt(row: FaucetRow): FaucetReceipt { return { requestId: row.request_id, state: row.state, signature: row.signature, lamports: 1_000_000_000, message: row.message }; }
  addGallery(genesis: string, mint: string, hash: string, signature: string) {
    this.db.prepare('INSERT INTO gallery VALUES(?,?,?,?,?) ON CONFLICT(genesis,mint) DO NOTHING').run(genesis, mint, hash, signature, new Date().toISOString());
  }
  gallery(genesis: string, offset: number, limit: number): GalleryEntry[] {
    const rows = this.db.prepare('SELECT a.document,g.signature,g.verified_at FROM gallery g JOIN assets a ON a.hash=g.asset_hash WHERE g.genesis=? ORDER BY g.verified_at DESC,g.mint LIMIT ? OFFSET ?').all(genesis, limit, offset) as { document: string; signature: string; verified_at: string }[];
    return rows.map(r => ({ ...JSON.parse(r.document) as AssetDocument, issuanceSignature: r.signature, verifiedAt: r.verified_at }));
  }
  galleryMint(genesis: string, mint: string): GalleryEntry | null {
    const row = this.db.prepare('SELECT a.document,g.signature,g.verified_at FROM gallery g JOIN assets a ON a.hash=g.asset_hash WHERE g.genesis=? AND g.mint=?').get(genesis, mint) as { document: string; signature: string; verified_at: string } | undefined;
    return row ? { ...JSON.parse(row.document) as AssetDocument, issuanceSignature: row.signature, verifiedAt: row.verified_at } : null;
  }
  close() { this.db.close(); }
}
