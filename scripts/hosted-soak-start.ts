import { constants, chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, readlinkSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { root } from './evidence.js';
import { publicJson, FIXED_T0 } from './release-check.js';
import { assertPrerequisite, digest, observeFrozen, privateJson, readFreeze, testInputs, testKey } from './workload.js';

const api = 'https://network-release-production.up.railway.app';
const web = 'https://solana-classic-soc.vercel.app';
const genesis = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const project = '356bcb0b-49c4-4bd3-bf10-bff7db8f33fe';
const environment = '3367b373-2332-4702-8cce-c12b8f03949e';
const prerequisites = ['load', 'backup-check', 'restart-check', 'pilot-agent-one', 'pilot-agent-two', 'monitoring-config', 'frontend-rollback', 'remote-negative-controls'];
const inputs = ['candidate-freeze', ...prerequisites];
const data = resolve('/data');
const require = createRequire(import.meta.url);
let browserVersion: string | null = null;
let child: ChildProcess | undefined;
let refreshing = false;
let shuttingDown = false;
let state: Record<string, unknown> = { state: 'booting', passed: false, soakStarted: false };

function directory(path: string, privateMode = false) {
  mkdirSync(path, { recursive: true, mode: privateMode ? 0o700 : 0o755 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.()) throw new Error('Hosted QA directories must be regular and owned by the runner.');
  if (privateMode) chmodSync(path, 0o700);
}
function boundedFile(path: string, privateMode = false) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 1_048_576 || stat.uid !== process.getuid?.() || (privateMode && (stat.mode & 0o077))) throw new Error('Hosted QA input must be a bounded owner-controlled regular file.');
  return stat;
}
function writePublic(name: string, value: unknown) {
  const path = resolve(data, 'evidence', name + '.json');
  const temporary = path + '.tmp';
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o644 });
  renameSync(temporary, path);
}
function publish(value: Record<string, unknown>) {
  state = { at: new Date().toISOString(), scope: 'hosted remote QA runner readiness; not 24-hour soak acceptance', passed: false, api, web, genesis, node: process.versions.node, pnpm: '10.34.7', playwright: require('@playwright/test/package.json').version, chromium: browserVersion, browsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH, ...value };
  writePublic('hosted-soak-readiness', state);
}
function copyPublicInputs() {
  const checksums: Record<string, string> = {};
  for (const name of inputs) {
    const source = resolve(data, 'inputs', name + '.json');
    const destination = resolve(root, 'evidence', name + '.json');
    if (!existsSync(source)) continue;
    boundedFile(source);
    // Never reinterpret or regenerate a freeze or prerequisite.
    copyFileSync(source, destination);
    checksums[name] = digest(readFileSync(destination));
  }
  return checksums;
}
function protectedKeyCopy() {
  const source = resolve(data, 'keys/soak-funder.json');
  const destination = resolve(root, '.data/soak-funder.json');
  boundedFile(source, true);
  if (existsSync(destination)) boundedFile(destination, true);
  copyFileSync(source, destination);
  chmodSync(destination, 0o600);
}
async function readiness() {
  if (refreshing || child || shuttingDown) return;
  refreshing = true;
  const issues: string[] = [];
  const inputChecksums: Record<string, string> = {};
  let freezeSha256: string | null = null;
  try {
    Object.assign(inputChecksums, copyPublicInputs());
    for (const name of inputs) if (!inputChecksums[name]) issues.push('Missing reviewed input: ' + name);
    const clock = publicJson(root, 'docs/sprint-clock.json') as { milestones: Record<string, { utc: string }> };
    const t0 = Date.parse(clock.milestones.T0!.utc);
    const deadline = Date.parse(clock.milestones.H144_deadline!.utc);
    const h72 = Date.parse(clock.milestones.H72_candidate!.utc);
    if (t0 !== Date.parse(FIXED_T0) || deadline - t0 !== 144 * 3_600_000 || h72 - t0 !== 72 * 3_600_000 || Date.now() + 86_400_000 + 60_000 > deadline) issues.push('A full uninterrupted soak must fit the original fixed clock.');
    if (!inputChecksums['candidate-freeze']) throw new Error('Candidate freeze has not been staged.');
    const freeze = readFreeze(api, genesis);
    freezeSha256 = inputChecksums['candidate-freeze']!;
    if (freeze.candidate.frontendOrigin !== web) throw new Error('Candidate frontend differs from the designated production origin.');
    for (const name of prerequisites) {
      if (!inputChecksums[name]) continue;
      try {
        const proof = publicJson(root, 'evidence/' + name + '.json');
        assertPrerequisite(proof, name, freeze);
        if (['load', 'backup-check', 'restart-check', 'pilot-agent-one', 'pilot-agent-two'].includes(name) && Date.parse(String(proof.at)) >= h72) throw new Error('Required drill finished after H72: ' + name);
      } catch (error) { issues.push(error instanceof Error ? error.message : 'Invalid prerequisite: ' + name); }
    }
    await observeFrozen(freeze);
    const context = await testInputs();
    if (context.api !== api || context.facts.expectedGenesisHash !== genesis) throw new Error('Hosted QA network identity mismatch.');
    if (!existsSync(resolve(data, 'keys/soak-funder.json'))) issues.push('Protected prefunded TEST actor has not been staged.');
    else {
      protectedKeyCopy();
      const input = privateJson('.data/soak-funder.json');
      if (input.api !== api || input.genesis !== genesis) throw new Error('Protected TEST actor network identity mismatch.');
      const funder = testKey(input);
      if (await context.connection.getBalance(funder.publicKey, 'confirmed') < 5_100_000_000) issues.push('Protected TEST actor balance must be at least 5.1 TEST.');
    }
    const activation = resolve(data, 'control/start.json');
    const attempt = resolve(data, 'control/attempt.json');
    if (existsSync(attempt)) issues.push('This hosted runner already claimed an activation; operator review is required for a fresh attempt.');
    if (existsSync(activation) && !existsSync(attempt)) {
      boundedFile(activation, true);
      const request = JSON.parse(readFileSync(activation, 'utf8')) as { action?: string; freezeSha256?: string; approvedAt?: string };
      const approval = Date.parse(request.approvedAt ?? '');
      if (request.action !== 'start-24h-soak' || request.freezeSha256 !== freezeSha256 || !Number.isFinite(approval) || approval < Date.parse(freeze.frozenAt) || approval > Date.now()) issues.push('Activation must explicitly approve the exact reviewed freeze after freezing.');
      if (!issues.length) {
        const fd = openSync(attempt, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        try { writeFileSync(fd, JSON.stringify({ at: new Date().toISOString(), freezeSha256, state: 'claimed', inputChecksums }) + '\n'); } finally { closeSync(fd); }
        publish({ state: 'starting', ready: true, soakStarted: true, freezeSha256, inputChecksums, issues: [] });
        child = spawn(process.execPath, ['--import', 'tsx', 'scripts/soak.ts'], { cwd: root, stdio: 'inherit', env: { ...process.env, SC_API_URL: api, SC_NETWORK_CONFIG: 'config/network.remote.json', SC_SOAK_FUNDER_FILE: '.data/soak-funder.json' } });
        child.once('error', () => publish({ state: 'interrupted', ready: false, soakStarted: true, freezeSha256, issues: ['Hosted soak subprocess could not start.'] }));
        child.once('exit', (code, signal) => {
          let result: unknown = null;
          try { result = JSON.parse(readFileSync(resolve(data, 'evidence/soak.json'), 'utf8')); } catch { /* No completed result is a failure. */ }
          const accepted = code === 0 && (result as { passed?: boolean } | null)?.passed === true;
          publish({ state: accepted ? 'completed' : 'interrupted', ready: false, soakStarted: true, soakAccepted: accepted, freezeSha256, exitCode: code, signal, issues: accepted ? [] : ['Hosted soak ended without a passed uninterrupted 24-hour result.'] });
        });
        return;
      }
    }
    publish({ state: issues.length ? 'blocked' : 'ready-awaiting-activation', ready: issues.length === 0, soakStarted: false, freezeSha256, inputChecksums, issues });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'Hosted QA readiness failed.');
    publish({ state: 'blocked', ready: false, soakStarted: false, freezeSha256, inputChecksums, issues });
  } finally { refreshing = false; }
}

if (process.platform !== 'linux' || process.versions.node !== '24.19.0' || execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim() !== '10.34.7' || require('@playwright/test/package.json').version !== '1.64.0') throw new Error('Hosted QA requires pinned Linux Node 24.19.0, pnpm 10.34.7 and Playwright 1.64.0.');
if (process.env.RAILWAY_PROJECT_ID !== project || process.env.RAILWAY_ENVIRONMENT_ID !== environment || process.env.RAILWAY_SERVICE_ID !== '5225cb9c-16af-4ec2-863e-a02f1c199fb3' || process.env.RAILWAY_SERVICE_NAME !== 'browser-soak-qa') throw new Error('Hosted QA must run only in the designated dedicated Railway service.');
if (process.env.RAILWAY_VOLUME_MOUNT_PATH !== data) throw new Error('Hosted QA requires its dedicated persistent volume mounted at /data.');
if (process.env.SC_API_URL !== api || process.env.SC_NETWORK_CONFIG !== 'config/network.remote.json' || process.env.PLAYWRIGHT_BROWSERS_PATH !== resolve(root, '.tools/playwright-browsers')) throw new Error('Hosted QA public configuration or browser installation path differs.');
const manifest = publicJson(root, 'docs/dependency-manifest.json') as { node_local?: string; pnpm?: string; packages?: Record<string, string> };
if (manifest.node_local !== '24.19.0' || manifest.pnpm !== '10.34.7' || manifest.packages?.['@playwright/test'] !== '1.64.0') throw new Error('Hosted QA toolchain differs from the frozen dependency manifest.');
for (const path of [data, resolve(data, 'inputs'), resolve(data, 'evidence'), resolve(root, 'evidence')]) directory(path);
for (const path of [resolve(data, 'keys'), resolve(data, 'control'), resolve(root, '.data')]) directory(path, true);
// Only generated outputs point into persistent storage. Reviewed inputs remain
// regular files because publicJson rejects symlinks in a freeze/prerequisite path.
for (const name of ['soak', 'soak-progress']) {
  const persistent = resolve(data, 'evidence', name + '.json');
  const output = resolve(root, 'evidence', name + '.json');
  if (!existsSync(persistent)) writeFileSync(persistent, '{}\n', { mode: 0o644 });
  try {
    const prior = lstatSync(output);
    if (!prior.isSymbolicLink() || readlinkSync(output) !== persistent) throw new Error('The QA image must not contain old soak outputs.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    symlinkSync(persistent, output);
  }
}
const browser = await chromium.launch({ headless: true });
browserVersion = browser.version();
await browser.close();
publish({ state: 'checking', ready: false, soakStarted: false });
const server = createServer((request, response) => {
  if (request.method !== 'GET' || !['/health', '/api/qa'].includes(request.url ?? '')) { response.writeHead(404).end(); return; }
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(request.url === '/health' ? { alive: true, state: state.state } : state));
});
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
await readiness();
const timer = setInterval(() => { void readiness(); }, 30_000);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  shuttingDown = true; clearInterval(timer);
  if (child) { publish({ state: 'interrupted', ready: false, soakStarted: true, issues: ['Hosted runner received a shutdown signal; full soak must be reviewed and restarted.'] }); child.kill(signal); }
  server.close(() => { if (!child) process.exit(0); });
});
