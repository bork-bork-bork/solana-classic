import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection } from '@solana/web3.js';
import type { NetworkFacts } from '@solana-classic/config';
import { assertNetwork } from '@solana-classic/chain';
export const root = resolve(import.meta.dirname, '..');
export function evidence(name: string, value: unknown) { mkdirSync(resolve(root, 'evidence'), { recursive: true }); writeFileSync(resolve(root, 'evidence', name + '.json'), JSON.stringify(value, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n'); }
export async function configuredApi() {
  const api = process.env.SC_API_URL ?? 'http://127.0.0.1:3000';
  const canonical = JSON.parse(readFileSync(resolve(root, process.env.SC_NETWORK_CONFIG ?? 'config/network.json'), 'utf8')) as NetworkFacts;
  if (!canonical.expectedGenesisHash) throw new Error('An independently recorded canonical genesis is required before test transactions.');
  const url = new URL(api);
  if (url.username || url.password || url.search || (canonical.mode === 'remote' && url.protocol !== 'https:')) throw new Error('Invalid experimental API origin.');
  const facts = await fetch(api + '/api/network', { signal: AbortSignal.timeout(10_000) }).then(r => { if (!r.ok) throw new Error('API network facts unavailable.'); return r.json() as Promise<NetworkFacts>; });
  if (!facts.expectedGenesisHash || facts.expectedGenesisHash !== canonical.expectedGenesisHash || facts.mode !== canonical.mode || !['local', 'remote'].includes(facts.mode) || facts.hasMonetaryValue !== false) throw new Error('Only the independently recorded experimental network is supported.');
  const connection = new Connection(api + '/api/rpc', { commitment: 'confirmed', disableRetryOnRateLimit: true });
  await assertNetwork(connection, facts.expectedGenesisHash);
  return { api, facts, connection };
}
