import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { NetworkFacts } from '@solana-classic/config';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export type Settings = { network: NetworkFacts; dataDir: string; assetOrigin: string; allowedOrigins: string[]; upstreamUrl: string; port: number; hosting?: 'linux' | 'railway' };
export function loadSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const configPath = resolve(REPO_ROOT, env.SC_NETWORK_CONFIG ?? 'config/network.json');
  const network = JSON.parse(readFileSync(configPath, 'utf8')) as NetworkFacts;
  if (!['local', 'remote'].includes(network.mode) || network.hasMonetaryValue !== false || network.operatorCount !== 1) throw new Error('Invalid experimental network settings.');
  const port = z.coerce.number().int().min(1024).max(65535).parse(env.API_PORT ?? 3000);
  const assetOrigin = new URL(env.ASSET_BASE_URL ?? `http://127.0.0.1:${port}`).origin;
  const allowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? env.APP_ORIGIN ?? 'http://127.0.0.1:5173').split(',').map(s => new URL(s.trim()).origin);
  const upstreamUrl = new URL(env.RPC_UPSTREAM ?? 'http://127.0.0.1:8899');
  if (upstreamUrl.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(upstreamUrl.hostname) || upstreamUrl.username || upstreamUrl.password || upstreamUrl.pathname !== '/' || upstreamUrl.search) throw new Error('RPC upstream must be a fixed loopback URL.');
  if (network.mode === 'remote' && (new URL(assetOrigin).protocol !== 'https:' || allowedOrigins.some(s => new URL(s).protocol !== 'https:'))) throw new Error('Remote frontend and immutable metadata require HTTPS.');
  const hosting = env.SC_HOSTING === 'railway' ? 'railway' : 'linux';
  if (hosting === 'railway' && (!env.RAILWAY_PROJECT_ID || env.RAILWAY_VOLUME_MOUNT_PATH !== '/data' || env.SC_DATA_DIR !== '/data/app' || configPath !== '/data/network.json' || network.mode !== 'remote')) throw new Error('Railway requires remote genesis configuration and fixed persistent /data paths.');
  return { network, dataDir: resolve(REPO_ROOT, env.SC_DATA_DIR ?? '.data/app'), assetOrigin, allowedOrigins, upstreamUrl: upstreamUrl.href, port, hosting };
}
