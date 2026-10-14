// Real loopback HTTP transport with synthetic RPC responses. These tests do
// not establish Agave fork choice, independent quorum or bridge security.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { PublicKey } from '@solana/web3.js';
import { encodeEvent, observeLocalEvent } from './sdk.mjs';

const key = n => new PublicKey(Uint8Array.from({length:32}, (_,i) => n+i)).toBase58();
function fixture() {
  const e = {bridge:key(1), sourceChain:key(2), destinationChain:key(3), sourceProgram:key(4), destinationProgram:key(5), sender:key(6), recipient:key(7), originAmount:1_000_000n, nonce:1n, slot:20n, epoch:1n, direction:0};
  const config = PublicKey.findProgramAddressSync([Buffer.from('config'), new PublicKey(e.bridge).toBuffer()], new PublicKey(e.sourceProgram))[0];
  const nonce = Buffer.alloc(8); nonce.writeBigUInt64LE(e.nonce);
  e.sourceEvent = PublicKey.findProgramAddressSync([Buffer.from('event'), config.toBuffer(), new PublicKey(e.sender).toBuffer(), nonce], new PublicKey(e.sourceProgram))[0].toBase58();
  return e;
}

test('observer stops on outages, stale recovery state and chain replacement; resumes read-only', async t => {
  const e = fixture(); let mode = 'healthy'; let genesisReads = 0;
  const calls = [];
  const server = createServer(async (req,res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); calls.push(request);
    if (mode === 'outage') { res.writeHead(503); res.end('unavailable'); return; }
    if (mode === 'disconnect') { req.socket.destroy(); return; }
    let result;
    if (request.method === 'getGenesisHash') {
      genesisReads++;
      result = mode === 'replaced' && genesisReads % 2 === 0 ? key(90) : e.sourceChain;
    } else {
      assert.equal(request.method, 'getAccountInfo');
      assert.equal(request.params[1].commitment, 'finalized');
      assert.equal(request.params[1].minContextSlot, 25);
      result = {context:{slot:mode === 'regressed' ? 24 : 25}, value:mode === 'missing' ? null : {owner:e.sourceProgram, executable:false, data:[encodeEvent(e).toString('base64'), 'base64']}};
    }
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(mode === 'rpcError' ? {jsonrpc:'2.0',id:1,error:{code:-32016,message:'Minimum context slot has not been reached'}} : {jsonrpc:'2.0',id:1,result}));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const args = {rpc:`http://127.0.0.1:${server.address().port}`, expectedGenesis:e.sourceChain, eventAddress:e.sourceEvent, expected:e, minimumContextSlot:25};
  const first = await observeLocalEvent(args);
  assert.equal(first.contextSlot,25); assert.deepEqual(first.signatures,[]);
  for (const failure of ['outage','disconnect','regressed','missing','rpcError','replaced']) {
    mode = failure; genesisReads = 0;
    await t.test(failure, () => assert.rejects(observeLocalEvent(args)));
  }
  mode = 'healthy';
  const recovered = await observeLocalEvent(args);
  assert.deepEqual(recovered,first);
  assert(calls.every(r => ['getGenesisHash','getAccountInfo'].includes(r.method)));
  assert.equal(recovered.productionReady,false);
});

test('invalid recovery checkpoints reject before touching the RPC', async () => {
  const e=fixture(); let calls=0;
  for (const minimumContextSlot of [-1,1.5,Number.MAX_SAFE_INTEGER+1,'25']) {
    await assert.rejects(observeLocalEvent({rpc:'http://127.0.0.1:9900',expectedGenesis:e.sourceChain,eventAddress:e.sourceEvent,expected:e,minimumContextSlot},() => {calls++; throw new Error('must not call');}));
  }
  assert.equal(calls,0);
});
