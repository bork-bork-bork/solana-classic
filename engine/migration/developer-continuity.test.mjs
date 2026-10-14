import test from 'node:test';
import assert from 'node:assert/strict';
import { capture, identities, verifyAccounts } from './developer-continuity.mjs';
import { PublicKey } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
const proof = JSON.parse(readFileSync(new URL('../../evidence/developer-program-access.json',import.meta.url)));
function snapshot() {
  // Original counter upgrade binary, pinned to its public deployed hash. No keys.
  const code = Buffer.from(readFileSync(new URL('./fixtures/counter-v2.b64',import.meta.url),'utf8').trim(),'base64');
  const programme = Buffer.alloc(36); programme.writeUInt32LE(2); new PublicKey(proof.programData).toBuffer().copy(programme,4);
  const data = Buffer.alloc(45+code.length); data.writeUInt32LE(3); data[12]=1; new PublicKey(proof.authority).toBuffer().copy(data,13); code.copy(data,45);
  const counter = authority => {const b=Buffer.alloc(40);new PublicKey(authority).toBuffer().copy(b);b.writeBigUInt64LE(1n,32);return b;};
  return {context:{slot:30},value:[programme,data,counter(proof.authority),counter(proof.browserExecution.publicWallet)].map((b,i) => ({owner:i<2?'BPFLoaderUpgradeab1e11111111111111111111111':proof.program,executable:i===0,lamports:1_000_000,data:[b.toString('base64'),'base64']}))};
}
function fetcher(s= snapshot(), genesis = identities.genesis) {
  return async(_url,o) => {const q=JSON.parse(o.body);return {ok:true,text:async() => JSON.stringify({jsonrpc:'2.0',id:1,result:q.method==='getGenesisHash'?genesis:s})};};
}
test('continuity baseline and repeat snapshot agree without mutation RPC',async () => {
  const calls=[];const transport=fetcher();
  const f=async(u,o) => {calls.push(JSON.parse(o.body));return transport(u,o);};
  const baseline=await capture({fetcher:f});
  const compared=await capture({baseline,fetcher:f});
  assert.equal(compared.comparedToBaseline,true);assert.equal(compared.canSwitchNow,false);
  assert(calls.every(q=>['getGenesisHash','getMultipleAccounts'].includes(q.method)));
  assert.equal(calls.at(-2).params[1].minContextSlot,30);
});
test('wrong chain, missing programme, changed authority and bytecode reject',async () => {
  await assert.rejects(capture({fetcher:fetcher(snapshot(),'wrong')}));
  let s=snapshot();s.value[0]=null;assert.throws(()=>verifyAccounts(s));
  for (const offset of [13,45]) {s=snapshot();const b=Buffer.from(s.value[1].data[0],'base64');b[offset]^=1;s.value[1].data[0]=b.toString('base64');assert.throws(()=>verifyAccounts(s));}
});
test('rollback behind checkpoint and divergent counters cannot pass comparison',async () => {
  const baseline=await capture({fetcher:fetcher()});
  let s=snapshot();s.context.slot=29;await assert.rejects(capture({baseline,fetcher:fetcher(s)}));
  s=snapshot();const b=Buffer.from(s.value[2].data[0],'base64');b.writeBigUInt64LE(2n,32);s.value[2].data[0]=b.toString('base64');await assert.rejects(capture({baseline,fetcher:fetcher(s)}));
});
