import { headers, input, rpcValid, relay, route, expectedGenesis, TransportFailure } from './developer-common.js';
const address = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function valid(path, value) { if (!value || typeof value !== 'object' || Array.isArray(value))
    return false; const exact = keys => Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)); if (path === 'api/rpc')
    return rpcValid(value); if (path === 'api/faucet')
    return exact(['publicKey', 'requestId']) && typeof value.publicKey === 'string' && address.test(value.publicKey) && uuid.test(value.requestId); if (path === 'api/assets')
    return exact(['mint', 'kind', 'name', 'symbol', 'presetId']) && typeof value.mint === 'string' && address.test(value.mint) && ['meme', 'nft'].includes(value.kind) && typeof value.name === 'string' && [...value.name.trim()].length > 0 && [...value.name.trim()].length <= 24 && typeof value.symbol === 'string' && /^[A-Za-z0-9]{1,10}$/.test(value.symbol) && Number.isInteger(value.presetId) && value.presetId >= 0 && value.presetId <= 3; if (path === 'api/gallery')
    return exact(['mint', 'issuanceSignature', 'contentHash']) && typeof value.mint === 'string' && address.test(value.mint) && /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(value.issuanceSignature) && /^[a-f0-9]{64}$/.test(value.contentHash); return false; }
const routes = new Map([['api/network', 'GET'], ['api/status', 'GET'], ['api/rpc', 'POST'], ['api/faucet', 'POST'], ['api/assets', 'POST'], ['api/gallery', 'GET,POST']]);
export default async function handler(request, response) { headers(response); const fail = (status, message) => { response.statusCode = status; response.end(JSON.stringify({ error: { code: 'DEVELOPER_API', message } })); }; try {
    const { url, path } = route(request, 'api.solanaclassic.net');
    if (!path && request.method === 'GET') {
        response.end(JSON.stringify({ name: 'Solana Classic Devnet', rpc: 'https://rpc.solanaclassic.net', network: 'https://api.solanaclassic.net/api/network', expectedGenesis, hasMonetaryValue: false }));
        return;
    }
    const allowed = routes.get(path);
    if (!allowed)
        return fail(404, 'Route not available');
    let query = '';
    for (const [k, v] of url.searchParams) {
        if (k === 'path')
            continue;
        if (path !== 'api/gallery' || request.method !== 'GET' || k !== 'limit' || !/^\d{1,2}$/.test(v) || Number(v) > 50 || query)
            return fail(400, 'Query not allowed');
        query = '?limit=' + v;
    }
    if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
    }
    if (!allowed.split(',').includes(request.method))
        return fail(405, 'Method not allowed');
    let body;
    if (request.method === 'POST') {
        body = input(request, path === 'api/rpc' ? 32768 : 4096);
        if (!valid(path, body))
            return fail(400, 'Unsupported API request');
    }
    await relay('/' + path + query, request, response, body);
}
catch (error) {
    return fail(error instanceof TransportFailure ? error.status : 503, error instanceof TransportFailure ? error.message : 'Devnet API unavailable. Check any existing receipt before retrying.');
} }
