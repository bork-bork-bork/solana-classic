import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { PublicKey } = createRequire('/app/package.json')('@solana/web3.js');
import { verifyAsset, currentNftOwner } from '/app/packages/chain/src/index.ts';
import { testInputs, readFreeze, observeFrozen } from '/app/scripts/workload.ts';
if (process.env.RAILWAY_SERVICE_ID !== '5225cb9c-16af-4ec2-863e-a02f1c199fb3') throw Error('Wrong QA service.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const phase = process.env.SC_RESTART_STAGE; if (!['before','after'].includes(phase)) throw Error('Explicit restart stage required.');
const { api, facts, connection } = await testInputs(); const savedFreeze = readFreeze(api, facts.expectedGenesisHash);
const observedRuntime = await fetch(api + '/api/runtime', {signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('Runtime unavailable');return r.json()});
for(const key of ['genesis','sourceCommit','coreSha256','agaveVersion','tokenProgramVersion','tokenProgramSha256']) if(observedRuntime[key]!==savedFreeze.runtime[key])throw Error('Executable identity changed');
if(phase==='after' && (observedRuntime.apiBootId===savedFreeze.runtime.apiBootId || observedRuntime.validatorBootId===savedFreeze.runtime.validatorBootId))throw Error('New process boots not observed');
const freeze = phase==='before' ? savedFreeze : {...savedFreeze,runtime:observedRuntime};
const baselineBytes = readFileSync('/data/inputs/restart-baseline.json'); const baseline = JSON.parse(baselineBytes);
if (baseline.api !== api || baseline.baseline.genesis !== freeze.genesis || baseline.baseline.assets.length > 50) throw Error('Baseline mismatch.');
await observeFrozen(freeze);
const balances = {};
for (const [address, expected] of Object.entries(baseline.baseline.balances)) {
 const balance = await connection.getBalance(new PublicKey(address), 'finalized');
 if (balance !== expected) throw Error('Native balance changed.'); balances[address] = balance;
}
const read = async url => { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw Error('Read failed: ' + r.status); return r; };
const assets = [];
for (const saved of baseline.baseline.assets) {
 const entry = await (await read(api + '/api/gallery/' + saved.mint)).json();
 if (entry.verifiedAt !== saved.verifiedAt) throw Error('Gallery database row changed.');
 await verifyAsset(connection, entry);
 const account = await connection.getAccountInfo(new PublicKey(saved.mint), 'finalized');
 if (!account || sha(account.data) !== saved.accountHash) throw Error('Mint bytes changed.');
 for (const [url, digest] of Object.entries(saved.hashes)) {
  if (new URL(url).origin !== api || !new URL(url).pathname.startsWith('/assets/')) throw Error('Wrong immutable origin.');
  if (sha(Buffer.from(await (await read(url)).arrayBuffer())) !== digest) throw Error('Immutable file changed.');
 }
 const owner = saved.owner ? await currentNftOwner(connection, saved.mint) : null;
 if (owner !== saved.owner) throw Error('NFT owner changed.'); assets.push({ mint: saved.mint, accountHash: saved.accountHash, owner, verifiedAt: saved.verifiedAt });
}
const r = await fetch(api + '/api/faucet', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({publicKey: baseline.wallet, requestId: baseline.requestId}), signal: AbortSignal.timeout(15000) });
if (!r.ok) throw Error('Existing faucet receipt unavailable.'); const replay = await r.json();
if (replay.signature !== baseline.receipt.signature || replay.lamports !== baseline.receipt.lamports || replay.requestId !== baseline.requestId || await connection.getBalance(new PublicKey(baseline.wallet), 'finalized') !== baseline.receipt.lamports) throw Error('Receipt replay changed grant or balance.');
await observeFrozen(freeze);
const proof = { at: new Date().toISOString(), scope:'remote actual repaired-build restart state '+phase+' snapshot; not hardware reboot or cold restore', passed:phase==='after', api, genesis:freeze.genesis, candidate:freeze.candidate, runtime:freeze.runtime, baselineSha256:sha(baselineBytes), balances, assets, sameOriginalReceipt:replay, noNewGrant:true };
if(phase==='after'){ const prior=JSON.parse(readFileSync('/data/evidence/restart-35f0-before.json')); for(const key of ['balances','assets','sameOriginalReceipt']) if(JSON.stringify(prior[key])!==JSON.stringify(proof[key]))throw Error('State changed across restart'); proof.runtimeBefore=prior.runtime; }
writeFileSync('/data/evidence/restart-35f0-'+phase+'.json', JSON.stringify(proof,null,2)); console.log(JSON.stringify({passed:true,assets:assets.length,at:proof.at}));
