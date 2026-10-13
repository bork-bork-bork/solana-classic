// Domain adapter only: the frozen gateway/validator and their safeguards stay intact.
const site = 'https://solanaclassic.net';
const gateway = 'https://network-release-production.up.railway.app';
const gatewayOrigin = 'https://solana-classic-soc.vercel.app';
const imageService = 'https://image-assets-production.up.railway.app';
const routes = new Map([
  ['api/network', 'GET'], ['api/status', 'GET'], ['api/runtime', 'GET'],
  ['api/gallery', 'GET,POST'], ['api/rpc', 'POST'],
  ['api/faucet', 'POST'], ['api/assets', 'POST'],
  ['api/upload-assets', 'POST'], ['api/upload-gallery', 'POST']
]);
export function validateRequest(request) {
  const url = new URL(request.url, site);
  const entries = [...url.searchParams];
  if (!entries.length || entries.filter(([key]) => key === 'path').length !== 1) return { status: 404 };
  const path = url.searchParams.get('path');
  let allowed = routes.get(path);
  if (/^api\/gallery\/[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(path)) allowed = 'GET';
  const query = new URLSearchParams();
  for (const [key, value] of entries) {
    if (key === 'path') continue;
    if (path !== 'api/gallery' || request.method !== 'GET' || !['cursor', 'limit'].includes(key) || !/^\d{1,7}$/.test(value) || query.has(key)) return { status: 404 };
    query.set(key, value);
  }
  if (!allowed) return { status: 404 };
  if (!allowed.split(',').includes(request.method)) return { status: 405 };
  const origin = request.headers.origin;
  if (origin && origin !== site) return { status: 403 };
  if (request.headers['sec-fetch-site'] === 'cross-site') return { status: 403 };
  if (request.method === 'POST' && origin !== site) return { status: 403 };
  if (request.method === 'POST' && !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) return { status: 415 };
  return { status: 200, path: path + (query.size ? '?' + query : '') };
}
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const fail = (status, message) => {
    response.statusCode = status;
    response.end(JSON.stringify({ error: { code: 'DOMAIN_GATEWAY', message } }));
  };
  const result = validateRequest(request);
  if (result.status !== 200) return fail(result.status, 'This network request is not allowed.');
  let body;
  if (request.method === 'POST') {
    body = typeof request.body === 'string' || Buffer.isBuffer(request.body)
      ? request.body : JSON.stringify(request.body);
    if (body === undefined || Buffer.byteLength(body) > (result.path === 'api/upload-assets' ? 1500000 : 32768)) return fail(413, 'Request exceeds the network limit.');
    try { JSON.parse(body); } catch { return fail(400, 'Valid JSON is required.'); }
  }
  try {
    // Do not forward cookies, authorization, client-supplied routing or IP headers.
    // The existing gateway remains responsible for RPC validation and rate limits.
    const custom = result.path.startsWith('api/upload-') || (request.method === 'GET' && result.path.startsWith('api/gallery'));
    const upstreamPath = result.path.replace('api/upload-assets', 'api/assets').replace('api/upload-gallery', 'api/gallery');
    const upstream = await fetch((custom ? imageService : gateway) + '/' + upstreamPath, {
      method: request.method, body, redirect: 'error',
      headers: { Origin: custom ? site : gatewayOrigin, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      signal: AbortSignal.timeout(15000)
    });
    if (!upstream.headers.get('content-type')?.includes('application/json') || !upstream.body) return fail(502, 'Unexpected network response.');
    const chunks = []; let bytes = 0;
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2097152) { await reader.cancel(); return fail(502, 'Response exceeds the network limit.'); }
      chunks.push(value);
    }
    response.statusCode = upstream.status;
    response.end(Buffer.concat(chunks));
  } catch { fail(503, 'The test network is temporarily unavailable.'); }
}
