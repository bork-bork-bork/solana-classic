import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Connection, Keypair } from '@solana/web3.js';
import { configuredApi, root } from './evidence.js';
export const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export async function testInputs() {
  const context = await configuredApi();
  if (context.facts.mode !== 'remote') throw new Error('A local fixture cannot satisfy the workload.');
  return context;
}
export function privateJson(path: string) {
  const file = resolve(root, path);
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 100_000 || !realpathSync(file).startsWith(realpathSync(resolve(root, '.data')) + sep)) throw new Error('QA keys must be bounded owner-private files under ignored .data.');
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}
export function testKey(value: unknown): Keypair {
  const input = value as { publicKey: string; secretKey: number[] };
  if (!Array.isArray(input?.secretKey) || input.secretKey.length !== 64 || !input.secretKey.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error('Invalid protected TEST key format.');
  const key = Keypair.fromSecretKey(Uint8Array.from(input.secretKey));
  if (key.publicKey.toBase58() !== input.publicKey) throw new Error('TEST key public identity mismatch.');
  return key;
}
export async function post<T>(api: string, path: string, body: unknown): Promise<T> {
  const r = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Workload API ${path} returned ${r.status}.`);
  return r.json() as Promise<T>;
}
export function session(api: string) {
  const connection = new Connection(api + '/api/rpc', { commitment: 'confirmed', disableRetryOnRateLimit: true });
  // Enforce actual 3-second RPC polling per signature, including SDK helpers.
  const original = connection.getSignatureStatuses.bind(connection);
  const last = new Map<string, number>();
  connection.getSignatureStatuses = async (signatures, config) => {
    const key = signatures.join(','); const previous = last.get(key) ?? 0;
    await pause(Math.max(0, 3_000 - (Date.now() - previous)));
    last.set(key, Date.now()); return original(signatures, config);
  };
  return connection;
}
export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)]!;
}
