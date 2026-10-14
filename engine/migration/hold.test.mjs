import test from 'node:test';
import assert from 'node:assert/strict';
import { isReadOnly, validRelease, migrationHeld } from './hold.mjs';
test('maintenance blocks signing, faucet, asset publication and batch requests',()=>{
  for(const request of [{method:'POST',url:'/api/faucet'}, {method:'POST',url:'/api/assets'}, {method:'POST',url:'/api/gallery'}, {method:'POST',url:'/api/rpc',body:{method:'sendTransaction'}}, {method:'POST',url:'/api/rpc',body:[{method:'getBalance'}]}, {method:'PUT',url:'/api/runtime'}, {method:'POST',url:'/api/rpc?x=1',body:{method:'getBalance'}}])assert.equal(isReadOnly(request),false);
});
test('maintenance permits bounded existing RPC read handlers and inspection, reports status unavailable',()=>{
  for(const request of [{method:'POST',url:'/api/rpc',body:{method:'getAccountInfo'}}, {method:'GET',url:'/api/runtime'}, {method:'GET',url:'/assets/hash/image.svg'}, {method:'OPTIONS',url:'/api/rpc'}])assert.equal(isReadOnly(request),true);
  assert.equal(isReadOnly({method:'GET',url:'/api/status?x=1'}),false);
});
test('missing or invalid release keeps the server held',()=>assert.equal(migrationHeld(),true));
test('write release must bind the exact image, canonical ledger, backup and continuity proof',()=>{
  const manifest={migrationId:'fixture',runId:'build',genesis:'canonical',preparedAt:'2026-10-14T00:00:00Z',binaries:{'solana-test-validator':{sha256:'a'.repeat(64)}}};
  const proof={passed:true,migrationId:'fixture',runId:'build',genesis:'canonical',validatorSha256:'a'.repeat(64),backupArchiveSha256:'b'.repeat(64),at:'2026-10-14T01:00:00Z'};
  const release={action:'enable-source-testnet-writes',migrationId:'fixture',runId:'build',genesis:'canonical',proofSha256:'c'.repeat(64),approvedAt:'2026-10-14T02:00:00Z'};
  const now=Date.parse('2026-10-14T03:00:00Z');assert.equal(validRelease(release,proof,manifest,'c'.repeat(64),now),true);
  for(const changed of [{...release,migrationId:'other'},{...release,genesis:'other'},{...release,approvedAt:'2026-10-14T04:00:00Z'},{...release,approvedAt:'2026-10-14T00:30:00Z'},{...release,proofSha256:'d'.repeat(64)}])assert.equal(validRelease(changed,proof,manifest,'c'.repeat(64),now),false);
  for(const changed of [{...proof,passed:false},{...proof,validatorSha256:'e'.repeat(64)},{...proof,backupArchiveSha256:'bad'}])assert.equal(validRelease(release,changed,manifest,'c'.repeat(64),now),false);
});
