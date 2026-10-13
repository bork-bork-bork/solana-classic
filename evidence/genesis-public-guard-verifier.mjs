import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Connection } from '@solana/web3.js';
import { assertNetwork } from '@solana-classic/chain';

assert.equal(process.env.RAILWAY_SERVICE_ID, '5225cb9c-16af-4ec2-863e-a02f1c199fb3');
assert.equal(process.env.RAILWAY_DEPLOYMENT_ID, '69bb0517-9ada-4b7c-a5fa-af837034003b');
const manifest = JSON.parse(readFileSync('/app/config/runtime-build.json', 'utf8'));
assert.equal(manifest.sourceCommit, '35f0eaf1dede45452c9cdf9e6403669e966c427d');
assert.equal(manifest.coreSha256, '30697f3e9b441b05a036d0704b42322d723b3998840ed43d88b18a0d7ef7d1dd');
const chainSourceSha256 = createHash('sha256').update(readFileSync('/app/packages/chain/src/index.ts')).digest('hex');
assert.equal(chainSourceSha256, manifest.files['packages/chain/src/index.ts']);
const checks = [];
for (const [network, rpc, expected] of [
  ['mainnet-beta', 'https://api.mainnet-beta.solana.com', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'],
  ['devnet', 'https://api.devnet.solana.com', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'],
]) {
  const methods = []; let observedGenesis = null;
  const restrictedFetch = async (input, init) => {
    assert.equal(new URL(String(input)).origin, rpc);
    assert.equal(init?.method, 'POST');
    const request = JSON.parse(String(init.body));
    assert(!Array.isArray(request)); assert.equal(request.method, 'getGenesisHash');
    methods.push(request.method);
    const response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const body = await response.clone().json();
    assert(response.ok); assert.equal(typeof body.result, 'string');
    observedGenesis = body.result;
    return response;
  };
  const connection = new Connection(rpc, { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: restrictedFetch });
  let rejection = null;
  try { await assertNetwork(connection, expected); }
  catch (error) {
    assert.equal(error.message, 'Experimental network identity is not verified. Transactions are disabled.');
    rejection = error.message;
  }
  assert.equal(observedGenesis, expected); assert(rejection);
  assert.equal(methods.length, 1);
  checks.push({ network, rpc, expectedGenesis: expected, observedGenesis, matchedExpectedActual: true, deniedByCurrentSDK: true, rejection, methods });
}
console.log(JSON.stringify({ at: new Date().toISOString(), scope: 'remote hosted current SDK rejection of actual public RPC genesis with matched expected identity; getGenesisHash only, no wallet or transaction calls', passed: true, serviceId: process.env.RAILWAY_SERVICE_ID, deploymentId: process.env.RAILWAY_DEPLOYMENT_ID, sourceCommit: manifest.sourceCommit, coreSha256: manifest.coreSha256, chainSourceSha256, checks, walletCreated: false, signedTransactions: 0, submittedTransactions: 0, faucetCalls: 0 }));
