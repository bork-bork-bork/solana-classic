// Read-only developer-account continuity check. No signatures, writes, wallet
// imports, deployment or validator controls. This is not a consistent backup.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';
const proof = JSON.parse(readFileSync(new URL('../../evidence/developer-program-access.json', import.meta.url)));
const loader = 'BPFLoaderUpgradeab1e11111111111111111111111';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const identities = {genesis:proof.genesis, rpc:proof.rpc, addresses:[proof.program,proof.programData,proof.nodeExecution.state,proof.browserExecution.state]};

export function verifyAccounts(snapshot) {
  if (!Number.isSafeInteger(snapshot?.context?.slot) || snapshot.context.slot < 0 || snapshot.value?.length !== 4) throw new Error('Invalid finalized account snapshot');
  const accounts = snapshot.value.map((a,i) => {
    if (!a || !Number.isSafeInteger(a.lamports) || a.lamports < 0 || !Array.isArray(a.data) || a.data[1] !== 'base64' || typeof a.executable !== 'boolean') throw new Error('Missing or invalid developer account');
    const bytes = Buffer.from(a.data[0],'base64');
    if (bytes.toString('base64') !== a.data[0]) throw new Error('Noncanonical account encoding');
    return {address:identities.addresses[i], owner:a.owner, executable:a.executable, lamports:a.lamports, bytes:bytes.length, dataSHA256:sha(bytes), data:bytes};
  });
  const [program,data,node,browser] = accounts;
  if (program.owner !== loader || !program.executable || program.bytes !== 36 || program.data.readUInt32LE() !== 2 || new PublicKey(program.data.subarray(4)).toBase58() !== proof.programData) throw new Error('Executable programme pointer changed');
  if (data.owner !== loader || data.executable || data.bytes < 45+proof.upgrade.bytes || data.data.readUInt32LE() !== 3 || data.data[12] !== 1 || new PublicKey(data.data.subarray(13,45)).toBase58() !== proof.authority || sha(data.data.subarray(45,45+proof.upgrade.bytes)) !== proof.upgrade.sha256) throw new Error('Programme bytecode or upgrade authority changed');
  for (const [account,authority] of [[node,proof.authority],[browser,proof.browserExecution.publicWallet]]) {
    if (account.owner !== proof.program || account.executable || account.bytes !== 40 || new PublicKey(account.data.subarray(0,32)).toBase58() !== authority || account.data.readBigUInt64LE(32) < 1n) throw new Error('Counter state or authority changed');
    account.counter = account.data.readBigUInt64LE(32).toString();
  }
  return accounts.map(({data,...publicAccount}) => publicAccount);
}

export async function capture({baseline=null,fetcher=fetch}={}) {
  if (baseline && (baseline.genesis !== identities.genesis || baseline.rpc !== identities.rpc || baseline.passed !== true || !Number.isSafeInteger(baseline.contextSlot) || baseline.contextSlot < 0)) throw new Error('Wrong continuity baseline');
  async function rpc(method,params=[]) {
    const r = await fetcher(identities.rpc,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
    if (!r.ok) throw new Error('Read-only continuity RPC unavailable');
    const raw = await r.text(); if (raw.length > 32768) throw new Error('Continuity response exceeds bound');
    const d = JSON.parse(raw); if (d.jsonrpc !== '2.0' || d.id !== 1 || d.error || !Object.hasOwn(d,'result')) throw new Error('Continuity RPC rejected read');
    return d.result;
  }
  if (await rpc('getGenesisHash') !== identities.genesis) throw new Error('Wrong canonical devnet');
  const snapshot = await rpc('getMultipleAccounts',[identities.addresses,{encoding:'base64',commitment:'finalized',minContextSlot:baseline?.contextSlot ?? 0}]);
  const accounts = verifyAccounts(snapshot);
  if (snapshot.context.slot < (baseline?.contextSlot ?? 0)) throw new Error('Ledger precedes continuity baseline');
  if (await rpc('getGenesisHash') !== identities.genesis) throw new Error('Genesis changed during continuity read');
  if (baseline && JSON.stringify(accounts) !== JSON.stringify(baseline.accounts)) throw new Error('Developer accounts differ from baseline; keep writes held and investigate');
  return {schemaVersion:1,at:new Date().toISOString(),scope:'Read-only finalized developer-account continuity; not a consistent backup, restore or migration acceptance',passed:true,genesis:identities.genesis,rpc:identities.rpc,contextSlot:snapshot.context.slot,comparedToBaseline:!!baseline,accounts,productionNetworkChanged:false,canSwitchNow:false};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2 && !(process.argv.length === 4 && process.argv[2] === '--compare')) throw new Error('Usage: node developer-continuity.mjs [--compare baseline.json]');
  const baseline = process.argv[2] ? JSON.parse(readFileSync(process.argv[3],'utf8')) : null;
  console.log(JSON.stringify(await capture({baseline}),null,2));
}
