// Public devnet transport only. No credentials, keys or caller-selected upstreams.
export class TransportFailure extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
export const upstream = 'https://network-release-production.up.railway.app';
export const expectedGenesis = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
export const methods = ['getGenesisHash', 'getHealth', 'getVersion', 'getLatestBlockhash', 'getBlockHeight', 'getBalance', 'getAccountInfo', 'getMultipleAccounts', 'getTokenAccountsByOwner', 'getTokenLargestAccounts', 'getTokenSupply', 'getTokenAccountBalance', 'getMinimumBalanceForRentExemption', 'getSignatureStatuses', 'getTransaction', 'getFeeForMessage', 'simulateTransaction', 'sendTransaction', 'getSlot', 'getBlockTime'];
export function headers(response) { response.setHeader('Access-Control-Allow-Origin', '*'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type, solana-client'); response.setHeader('Access-Control-Max-Age', '600'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('X-Content-Type-Options', 'nosniff'); }
export function input(request, max = 32768) { if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''))
    throw new TransportFailure(415, 'JSON content type required'); const text = typeof request.body === 'string' || Buffer.isBuffer(request.body) ? request.body : JSON.stringify(request.body); if (text === undefined || Buffer.byteLength(text) > max)
    throw new TransportFailure(413, 'Request exceeds its body limit'); try {
    return JSON.parse(text.toString());
}
catch {
    throw new TransportFailure(400, 'Valid JSON required');
} }
export function rpcValid(body) { return body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(k => ['jsonrpc', 'id', 'method', 'params'].includes(k)) && body.jsonrpc === '2.0' && (body.id === null || typeof body.id === 'string' && body.id.length <= 100 || typeof body.id === 'number' && Number.isFinite(body.id)) && methods.includes(body.method) && (body.params === undefined || Array.isArray(body.params) && body.params.length <= 4); }
export async function relay(path, request, response, body) { const result = await fetch(upstream + path, { method: request.method, redirect: 'error', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) }); if (!result.body || !result.headers.get('content-type')?.includes('application/json'))
    throw new Error('Unexpected upstream'); let size = 0; const chunks = []; for await (const chunk of result.body) {
    size += chunk.length;
    if (size > 2097152)
        throw new Error('Response exceeds 2 MB');
    chunks.push(Buffer.from(chunk));
} response.statusCode = result.status; response.end(Buffer.concat(chunks)); }
export function route(request, host) { const url = new URL(request.url, 'https://' + host); if (url.searchParams.getAll('path').length !== 1)
    throw new TransportFailure(404, 'Route not allowed'); if (url.searchParams.get('host') === host)
    url.searchParams.delete('host'); return { url, path: url.searchParams.get('path') }; }
