import { GENESIS } from './display';
export const VAULT_STORAGE_KEY = 'classic.devnet.wallet.v1';
const ITERATIONS = 600_000;
const MAX_RECORD = 32_768;
type RecordV1 = { version: 1; genesis: string; address: string; iterations: number; salt: string; iv: string; ciphertext: string };
const bytes = (value: Uint8Array) => Uint8Array.from(value).buffer;
export const toBase64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
export function fromBase64(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > MAX_RECORD) throw new Error('Saved test wallet is invalid.');
  try { return Uint8Array.from(atob(value), x => x.charCodeAt(0)); } catch { throw new Error('Saved test wallet is invalid.'); }
}
function parse(raw: string): RecordV1 {
  if (typeof raw !== 'string' || raw.length > MAX_RECORD) throw new Error('Saved test wallet is too large.');
  let value: RecordV1;
  try { value = JSON.parse(raw); } catch { throw new Error('Saved test wallet is damaged.'); }
  if (!value || typeof value.address !== 'string' || value.version !== 1 || value.genesis !== GENESIS || value.iterations !== ITERATIONS || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.address) || typeof value.salt !== 'string' || typeof value.iv !== 'string' || typeof value.ciphertext !== 'string' || fromBase64(value.salt).length !== 16 || fromBase64(value.iv).length !== 12 || fromBase64(value.ciphertext).length < 17) throw new Error('Saved test wallet format or network is invalid.');
  return value;
}
function aad(record: Pick<RecordV1, 'version'|'genesis'|'address'>) { return new TextEncoder().encode(JSON.stringify([record.version, record.genesis, record.address])); }
async function derive(password: string, salt: Uint8Array) {
  if (password.length < 12 || password.length > 128) throw new Error('Use a password between 12 and 128 characters.');
  const encoded = new TextEncoder().encode(password);
  try {
    const material = await crypto.subtle.importKey('raw', bytes(encoded), 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(salt), iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
  } finally { encoded.fill(0); }
}
export async function encryptVault(payload: string, password: string, address: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await derive(password, salt);
  const record = await seal(payload, key, { version: 1, genesis: GENESIS, address, iterations: ITERATIONS, salt: toBase64(salt) });
  return { record, key };
}
async function seal(payload: string, key: CryptoKey, header: Omit<RecordV1, 'iv'|'ciphertext'>) {
  if (payload.length > 12_000) throw new Error('Test wallet recovery state exceeds its size limit.');
  const iv = crypto.getRandomValues(new Uint8Array(12)); const plaintext = new TextEncoder().encode(payload);
  try {
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bytes(iv), additionalData: bytes(aad(header)), tagLength: 128 }, key, bytes(plaintext));
    const record = JSON.stringify({ ...header, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) }); parse(record); return record;
  } finally { plaintext.fill(0); }
}
export async function decryptVault(raw: string, password: string) {
  const record = parse(raw); const key = await derive(password, fromBase64(record.salt));
  let plaintext: ArrayBuffer;
  try { plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(fromBase64(record.iv)), additionalData: bytes(aad(record)), tagLength: 128 }, key, bytes(fromBase64(record.ciphertext))); }
  catch { throw new Error('Unable to unlock. Check the password; the saved wallet may be damaged.'); }
  const value = new Uint8Array(plaintext);
  try { return { payload: new TextDecoder('utf-8', { fatal: true }).decode(value), address: record.address, key }; } finally { value.fill(0); }
}
export class BrowserVault {
  #key: CryptoKey | null = null; #expected: string | null = null;
  constructor(private storage: Storage = localStorage, private locks: LockManager = navigator.locks) {}
  present() { return this.storage.getItem(VAULT_STORAGE_KEY) !== null; }
  unlocked() { return this.#key !== null; }
  lock() { this.#key = null; this.#expected = null; }
  async #exclusive<T>(operation: () => Promise<T>) {
    if (!crypto.subtle || !this.locks?.request) throw new Error('Encrypted test wallets require a secure browser with exclusive storage locks.');
    return this.locks.request(VAULT_STORAGE_KEY, { mode: 'exclusive', signal: AbortSignal.timeout(10_000) }, operation);
  }
  async save(payload: string, password: string, address: string) {
    await this.#exclusive(async () => {
      if (this.present()) throw new Error('A saved test wallet already exists. Unlock it first.');
      const saved = await encryptVault(payload, password, address);
      this.storage.setItem(VAULT_STORAGE_KEY, saved.record); this.#expected = saved.record; this.#key = saved.key;
    });
  }
  async unlock(password: string) {
    return this.#exclusive(async () => {
      const raw = this.storage.getItem(VAULT_STORAGE_KEY); if (!raw) throw new Error('No saved test wallet was found.');
      const result = await decryptVault(raw, password);
      this.#expected = raw; this.#key = result.key; return { payload: result.payload, address: result.address };
    });
  }
  async commit(payload: string) {
    if (!this.#key || !this.#expected) throw new Error('Unlock the saved test wallet before continuing.');
    await this.#exclusive(async () => {
      if (this.storage.getItem(VAULT_STORAGE_KEY) !== this.#expected) throw new Error('Saved wallet changed in another tab. Lock and unlock again before continuing.');
      const record = parse(this.#expected!);
      const next = await seal(payload, this.#key!, { version: 1, genesis: GENESIS, address: record.address, iterations: ITERATIONS, salt: record.salt });
      this.storage.setItem(VAULT_STORAGE_KEY, next); this.#expected = next;
    });
  }
  async remove() {
    if (!this.#key || !this.#expected) throw new Error('Unlock the saved test wallet before removing it.');
    await this.#exclusive(async () => {
      if (this.storage.getItem(VAULT_STORAGE_KEY) !== this.#expected) throw new Error('Saved wallet changed in another tab. Lock and unlock again.');
      this.storage.removeItem(VAULT_STORAGE_KEY); this.lock();
    });
  }
}
