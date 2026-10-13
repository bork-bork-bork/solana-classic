import { readFileSync } from 'node:fs';
import { summarize } from '../lib/status.mjs';
const checkpoint = JSON.parse(readFileSync(new URL('../public/data/checkpoint.json', import.meta.url), 'utf8'));
const urls = {
  network: 'https://network-release-production.up.railway.app/api/status',
  runtime: 'https://network-release-production.up.railway.app/api/runtime',
  monitor: 'https://operator-monitor-production.up.railway.app/api/monitor',
  qa: 'https://browser-soak-qa-production.up.railway.app/api/qa',
  progress: 'https://browser-soak-qa-production-e64c.up.railway.app/api/progress'
};
async function probe(url) {
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6500), redirect: 'error', headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Source unavailable');
    const reader = response.body.getReader(); const chunks = []; let bytes = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 65536) { await reader.cancel(); throw new Error('Bound exceeded'); } chunks.push(value); }
    return { ok: true, fetchedAt, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch { return { ok: false, fetchedAt }; }
}
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (request.method !== 'GET') { response.statusCode = 405; response.setHeader('Allow', 'GET'); response.end(JSON.stringify({ error: 'Read-only endpoint' })); return; }
  const probes = Object.fromEntries(await Promise.all(Object.entries(urls).map(async ([key, url]) => [key, await probe(url)])));
  response.end(JSON.stringify(summarize(checkpoint, probes)));
}
