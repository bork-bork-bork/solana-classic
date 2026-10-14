import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Connection } from '@solana/web3.js';
import { rpcInputSchema, faucetInputSchema, assetInputSchema, galleryInputSchema } from '@solana-classic/config';
import { assertNetwork } from '@solana-classic/chain';
import network from './network.json';
const directory = resolve('.tools/developer-app'), port = Number(process.env.SC_DEVELOPER_PORT ?? 3910), bind = process.env.SC_DEVELOPER_BIND ?? '127.0.0.1';
if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid developer port');
const configuredOrigin = process.env.SC_APP_ORIGIN ?? 'http://127.0.0.1:' + port;
const origin = new URL(configuredOrigin);
if (origin.origin !== configuredOrigin || origin.username || origin.password || origin.search || origin.hash || (origin.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(origin.hostname)))
    throw new Error('Use an explicit HTTPS application origin or a local development origin');
const connection = new Connection(network.rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });
const limits = new Map<string, {
    at: number;
    count: number;
}>();
let active = 0;
function limit(key: string, max: number) { const now = Date.now(); let row = limits.get(key); if (!row || now - row.at >= 60000) {
    row = { at: now, count: 0 };
    limits.set(key, row);
} if (++row.count > max)
    return false; return true; }
const routes = new Map([['/api/network', 'GET'], ['/api/status', 'GET'], ['/api/rpc', 'POST'], ['/api/faucet', 'POST'], ['/api/assets', 'POST'], ['/api/gallery', 'GET,POST']]);
class Failure extends Error {
    constructor(readonly status: number, message: string) { super(message); }
}
export async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Cache-Control', 'no-store');
    const fail = (code: number, message: string) => { response.statusCode = code; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ error: { code: 'DEVELOPER_GATEWAY', message } })); };
    let entered = false;
    try {
        const url = new URL(request.url ?? '/', configuredOrigin);
        const browserOrigin = request.headers.origin;
        if (browserOrigin && browserOrigin !== configuredOrigin)
            throw new Failure(403, 'This application origin is not allowed');
        if (browserOrigin) {
            response.setHeader('Access-Control-Allow-Origin', configuredOrigin);
            response.setHeader('Vary', 'Origin');
        }
        if (request.method === 'OPTIONS') {
            if (!routes.has(url.pathname))
                throw new Failure(404, 'Route not available');
            response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            response.setHeader('Access-Control-Allow-Headers', 'Content-Type, solana-client');
            response.statusCode = 204;
            response.end();
            return;
        }
        const allowed = routes.get(url.pathname);
        if (!allowed) {
            if (request.method !== 'GET' || url.search)
                throw new Failure(404, 'Route not available');
            const path = resolve(directory, '.' + url.pathname);
            if (!path.startsWith(directory + '/') || !existsSync(path) || url.pathname.includes('..'))
                throw new Failure(404, 'File not available');
            response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' })[extname(path)] ?? 'application/octet-stream');
            response.end(readFileSync(path));
            return;
        }
        if (!allowed.split(',').includes(request.method ?? ''))
            throw new Failure(405, 'Method not allowed');
        if (url.search && (url.pathname !== '/api/gallery' || [...url.searchParams].some(([k, v]) => k !== 'limit' || !/^\d{1,2}$/.test(v) || Number(v) > 50) || url.searchParams.getAll('limit').length !== 1))
            throw new Failure(400, 'Query not allowed');
        const ip = request.socket.remoteAddress ?? 'unknown';
        if (!limit('read:' + ip, 600) || active >= 8)
            throw new Failure(429, 'Developer gateway limit reached; wait before retrying');
        active++;
        entered = true;
        let body: string | undefined;
        if (request.method === 'POST') {
            if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? ''))
                throw new Failure(415, 'JSON is required');
            let raw = Buffer.alloc(0);
            for await (const chunk of request) {
                raw = Buffer.concat([raw, Buffer.from(chunk)]);
                if (raw.length > 32768)
                    throw new Failure(413, 'Request exceeds 32 KB');
            }
            let value: unknown;
            try {
                value = JSON.parse(raw.toString());
            }
            catch {
                throw new Failure(400, 'Valid JSON is required');
            }
            const schema = url.pathname === '/api/rpc' ? rpcInputSchema : url.pathname === '/api/faucet' ? faucetInputSchema : url.pathname === '/api/assets' ? assetInputSchema : galleryInputSchema;
            const parsed = schema.safeParse(value);
            if (!parsed.success)
                throw new Failure(400, 'Request does not match the supported API');
            body = JSON.stringify(parsed.data);
            const method = (parsed.data as {
                method?: string;
            }).method;
            const mutation = url.pathname !== '/api/rpc' || method === 'sendTransaction';
            if (mutation) {
                if (!limit('write:' + ip, 50))
                    throw new Failure(429, 'Submission limit reached');
                await assertNetwork(connection, network.expectedGenesisHash);
            }
        }
        const upstream = await fetch(network.apiBase + url.pathname + url.search, { method: request.method, body, redirect: 'error', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, signal: AbortSignal.timeout(15000) });
        if (!upstream.body || !upstream.headers.get('content-type')?.includes('application/json'))
            throw new Failure(502, 'Unexpected devnet response');
        let size = 0;
        const chunks = [];
        const reader = upstream.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > 2097152) {
                await reader.cancel();
                throw new Failure(502, 'Response exceeds 2 MB');
            }
            chunks.push(Buffer.from(value));
        }
        response.statusCode = upstream.status;
        response.setHeader('Content-Type', 'application/json');
        response.end(Buffer.concat(chunks));
    }
    catch (error) {
        fail(error instanceof Failure ? error.status : 503, error instanceof Failure ? error.message : 'Devnet request unavailable; preserve any existing receipt before retrying');
    }
    finally {
        if (entered)
            active--;
    }
}
export function startGateway() { const server = createServer((request, response) => { if (request.url === '/')
    request.url = '/index.html'; void handle(request, response); }); server.requestTimeout = 20000; server.headersTimeout = 10000; server.listen(port, bind, () => console.log('Classic developer app: ' + configuredOrigin + ' (fixed devnet gateway; no credentials forwarded)')); const cleanup = setInterval(() => { const now = Date.now(); for (const [k, v] of limits)
    if (now - v.at > 60000)
        limits.delete(k); }, 60000); cleanup.unref(); return server; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    startGateway();
