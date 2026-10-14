import { headers, input, rpcValid, relay, route, expectedGenesis, methods, TransportFailure } from './developer-common.js';
export default async function handler(request, response) {
    headers(response);
    let body;
    const fail = (status, code, message) => { response.statusCode = status; response.end(JSON.stringify({ jsonrpc: '2.0', id: body && typeof body.id === 'string' ? body.id : null, error: { code, message } })); };
    try {
        const { url, path } = route(request, 'rpc.solanaclassic.net');
        if (path !== '' && path !== 'api/rpc' || [...url.searchParams].some(([k]) => k !== 'path'))
            return fail(404, -32600, 'RPC is available at the root endpoint only');
        if (request.method === 'OPTIONS') {
            response.statusCode = 204;
            response.end();
            return;
        }
        if (request.method === 'GET') {
            response.end(JSON.stringify({ name: 'Solana Classic Devnet', rpc: 'https://rpc.solanaclassic.net', api: 'https://api.solanaclassic.net', expectedGenesis, hasMonetaryValue: false, methods, transport: 'HTTP JSON-RPC; confirmation polling. No WebSockets or batch requests.' }));
            return;
        }
        if (request.method !== 'POST')
            return fail(405, -32600, 'POST is required');
        body = input(request);
        if (!rpcValid(body))
            return fail(400, -32600, 'Unsupported JSON-RPC request');
        await relay('/api/rpc', request, response, body);
    }
    catch (error) {
        return fail(error instanceof TransportFailure ? error.status : 503, error instanceof TransportFailure ? -32600 : -32000, error instanceof TransportFailure ? error.message : 'Devnet RPC unavailable. Preserve any existing transaction receipt before retrying.');
    }
}
