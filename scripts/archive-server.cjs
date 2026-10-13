// Temporary intra-project recovery transport, never a public RPC/asset route.
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
if (process.env.RAILWAY_PROJECT_ID !== '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe' || process.env.RAILWAY_SERVICE_ID !== 'd0a1de40-bd9c-47eb-a7fc-477f1c55b2d6') throw new Error('Wrong recovery source.');
const token = fs.readFileSync('/data/operator/transfer-token.txt', 'utf8').trim();
if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Protected transfer token unavailable.');
const expected = Buffer.from('Bearer ' + token);
const path = '/data/backups/current.tar.gz';
const server = http.createServer((request, response) => {
  const supplied = Buffer.from(request.headers.authorization || '');
  if (request.method !== 'GET' || request.url !== '/archive' || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Length': fs.statSync(path).size, 'Cache-Control': 'no-store' });
  const stream = fs.createReadStream(path); stream.on('error', () => response.destroy()); response.on('close', () => stream.destroy()); stream.pipe(response);
});
server.listen(3001, '::', () => { fs.writeFileSync('/data/operator/archive-server.pid', String(process.pid), { mode: 0o600 }); console.log('Private authenticated recovery transport started on unpublished port3001.'); });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
