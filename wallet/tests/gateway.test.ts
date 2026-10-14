import test from 'node:test';
import assert from 'node:assert/strict';
import { API } from '../src/display';
import { gatewayBase, immutableAsset, IMAGE_API } from '../src/gateway';
test('gateway permits only fixed upstream or exact same-origin adapter', () => {
  assert.equal(gatewayBase(), API);
  assert.equal(gatewayBase({ apiBase: '/_network', origin: 'https://solanaclassic.net' }), 'https://solanaclassic.net/_network');
  assert.equal(gatewayBase({ apiBase: '/_network', origin: 'http://127.0.0.1:5188' }), 'http://127.0.0.1:5188/_network');
  for (const apiBase of ['https://api.mainnet.solana.com', '//evil.example', '/_network/../other']) assert.throws(() => gatewayBase({ apiBase: apiBase as '/_network', origin: 'https://solanaclassic.net' }));
  for (const origin of ['http://remote.example', 'https://user:pass@solanaclassic.net', 'https://solanaclassic.net/path']) assert.throws(() => gatewayBase({ apiBase: '/_network', origin }));
});
test('same-origin media adapter retains the fixed immutable asset identity', () => {
  const path = '/assets/' + 'a'.repeat(64) + '/metadata.json';
  assert.equal(immutableAsset(API + path, 'https://solanaclassic.net/_network'), 'https://solanaclassic.net/chain-assets/' + path.slice('/assets/'.length));
  assert.equal(immutableAsset(IMAGE_API + path, 'https://solanaclassic.net/_network'), 'https://solanaclassic.net/uploaded-assets/' + path.slice('/assets/'.length));
  assert.throws(() => immutableAsset(IMAGE_API + path));
  for (const url of ['https://evil.example' + path, API + '/api/rpc', API + path + '?x=1']) assert.throws(() => immutableAsset(url));
});
