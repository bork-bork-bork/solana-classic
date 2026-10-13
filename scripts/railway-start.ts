import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createHash } from 'node:crypto';
import { KNOWN_PUBLIC_GENESIS, validateExperimentalGenesis, verifyPrograms } from '@solana-classic/chain';
import type { NetworkFacts } from '@solana-classic/config';
import { randomUUID } from 'node:crypto';
import { railwayOperation } from './railway-ops.js';

if (process.env.SC_HOSTING !== 'railway' || !process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_VOLUME_MOUNT_PATH !== '/data') throw new Error('This entrypoint requires a persistent Railway service mounted at /data.');
if (!process.env.ASSET_BASE_URL || !process.env.APP_ORIGIN) throw new Error('Permanent HTTPS asset and frontend origins are required.');
for (const origin of [process.env.ASSET_BASE_URL, process.env.APP_ORIGIN]) if (new URL(origin).protocol !== 'https:') throw new Error('Remote origins must use HTTPS.');
await railwayOperation();
const data = '/data'; const ledger = resolve(data, 'ledger'); const config = resolve(data, 'network.json');
const existingLedger = existsSync(resolve(ledger, 'genesis.bin'));
if (existingLedger !== existsSync(config)) throw new Error('Ledger/configuration persistence mismatch. Restore the matching pair; do not initialize a replacement genesis.');
if (!existingLedger && readdirSync(data).some(name => name !== 'lost+found')) {
  // Explicit recovery for the logged CLI-argument failure before any ledger was created.
  // Keep the original bootstrap. A durable receipt makes this exception single-use.
  const resumeAck = process.env.SC_PRE_LEDGER_RECOVERY === '5196e910-bb6a-4205-91f9-28b9dd7be65e';
  const names = readdirSync(data).filter(name => name !== 'lost+found');
  const operatorFiles = existsSync(resolve(data, 'operator')) ? readdirSync(resolve(data, 'operator')) : [];
  if (!resumeAck || names.length !== 1 || names[0] !== 'operator' || operatorFiles.length !== 1 || operatorFiles[0] !== 'bootstrap.json') throw new Error('Residual persistent state found without ledger/configuration. Restore matching state; automatic reinitialization is forbidden.');
  writeFileSync(resolve(data, 'pre-ledger-recovery.json'), JSON.stringify({ failedDeployment: process.env.SC_PRE_LEDGER_RECOVERY, at: new Date().toISOString(), action: 'Preserved bootstrap after CLI rejection; no previous genesis or app state existed.' }), { flag: 'wx', mode: 0o600 });
}
if (process.env.SC_DATA_DIR !== '/data/app' || process.env.SC_NETWORK_CONFIG !== config) throw new Error('Railway data and genesis configuration must remain at their fixed volume paths.');
mkdirSync(resolve(data, 'operator'), { recursive: true, mode: 0o700 });
const bootstrapPath = resolve(data, 'operator/bootstrap.json');
if (!existsSync(bootstrapPath)) {
  if (existingLedger) throw new Error('Existing ledger is missing its protected operator file.');
  writeFileSync(bootstrapPath, JSON.stringify([...Keypair.generate().secretKey]), { mode: 0o600, flag: 'wx' });
}
const bootstrap = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(bootstrapPath, 'utf8')) as number[]));
const tag = process.env.SC_AGAVE_TAG ?? 'v4.3.0';
if (!['v4.3.0', 'v3.0.14'].includes(tag)) throw new Error('Unreviewed Agave runtime pin.');
const binary = resolve(`.tools/agave-linux-${tag}/solana-release/bin/solana-test-validator`);
const children: ChildProcess[] = []; let stopping = false;
function stop(code: number) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const active = children.filter(child => child.exitCode === null && child.signalCode === null);
  if (!active.length) process.exit(code);
  let remaining = active.length;
  const timer = setTimeout(() => { for (const child of active) child.kill('SIGKILL'); process.exit(code); }, 25_000);
  for (const child of active) child.once('exit', () => { if (--remaining === 0) { clearTimeout(timer); process.exit(code); } });
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => stop(0));
const tokenProgramPath = resolve('.tools/programs/spl_token_2022-v10.0.0.so');
process.env.SC_VALIDATOR_BOOT_ID = randomUUID();
process.env.SC_VALIDATOR_STARTED_AT = new Date().toISOString();
const programArgs = process.env.SC_TOKEN_PROGRAM === '10.0.0' ? ['--bpf-program', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', tokenProgramPath] : [];
if (programArgs.length && createHash('sha256').update(readFileSync(tokenProgramPath)).digest('hex') !== 'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68') throw new Error('Token-2022 binary integrity mismatch.');
const validator = spawn(binary, ['--ledger', ledger, '--bind-address', '127.0.0.1', '--rpc-port', '8899', '--mint', bootstrap.publicKey.toBase58(), '--faucet-sol', '1000000', '--faucet-per-request-sol-cap', '1', '--faucet-per-time-sol-cap', '100', '--faucet-time-slice-secs', '60', '--limit-ledger-size', '800000', ...programArgs, '--log'], { stdio: 'inherit', env: process.env });
children.push(validator);
validator.once('error', () => { console.error('Pinned validator failed to start.'); stop(1); });
validator.once('exit', code => { if (!stopping) { console.error('Validator stopped; API will stop with it.', code); stop(1); } });
const connection = new Connection('http://127.0.0.1:8899', { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }) });
let genesis: string | null = null;
const started = Date.now();
while (!stopping && Date.now() - started < 600_000) {
  try {
    const actual = await connection.getGenesisHash();
    if (KNOWN_PUBLIC_GENESIS.has(actual)) throw new Error('Public Solana genesis is forbidden.');
    await verifyPrograms(connection); await connection.getSlot('confirmed');
    if (programArgs.length) {
      const program = await connection.getAccountInfo(new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'), 'confirmed');
      if (!program) throw new Error('Token-2022 unavailable.');
      let code = program.data;
      if (program.owner.toBase58() === 'BPFLoaderUpgradeab1e11111111111111111111111') {
        const programData = await connection.getAccountInfo(new PublicKey(program.data.subarray(4, 36)), 'confirmed');
        if (!programData) throw new Error('Token-2022 executable data unavailable.');
        code = programData.data.subarray(45);
      }
      if (code.length !== 506896 || createHash('sha256').update(code).digest('hex') !== 'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68') throw new Error('Loaded Token-2022 program does not match the pinned official binary.');
    }
    genesis = actual; break;
  } catch { await new Promise(r => setTimeout(r, 3_000)); }
}
if (!genesis) { console.error('Independent validator/program readiness timed out.'); stop(1); }
else {
  try {
  if (existsSync(config)) {
    const saved = JSON.parse(readFileSync(config, 'utf8')) as NetworkFacts;
    validateExperimentalGenesis(saved.expectedGenesisHash, genesis);
  } else {
    const template = JSON.parse(readFileSync('config/network.json', 'utf8')) as NetworkFacts;
    const facts: NetworkFacts = { ...template, mode: 'remote', expectedGenesisHash: genesis };
    writeFileSync(config + '.tmp', JSON.stringify(facts, null, 2) + '\n', { mode: 0o644 }); renameSync(config + '.tmp', config);
  }
  console.log('Verified independent remote experimental genesis:', genesis);
  const api = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], { stdio: 'inherit', env: process.env });
  children.push(api);
  if (process.env.SC_QA_PREFUND === 'load-soak') {
    const funding = spawn(process.execPath, ['--import', 'tsx', 'scripts/operator-fund.ts'], { stdio: 'inherit', env: process.env });
    children.push(funding);
    funding.once('error', () => stop(1));
    funding.once('exit', code => { if (code && !stopping) stop(1); });
  }
  api.once('error', () => stop(1)); api.once('exit', code => { if (!stopping) stop(code || 1); });
  } catch {
    console.error('Saved remote genesis configuration is invalid or mismatched; stopping without replacement.'); stop(1);
  }
}
