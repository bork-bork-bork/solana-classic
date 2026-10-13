import { chromium, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PublicKey, Keypair } from '@solana/web3.js';
import { transferNative, waitForSignature } from '@solana-classic/chain';
import { evidence, root } from './evidence.js';
import { publicJson, FIXED_T0 } from './release-check.js';
import { testInputs, privateJson, testKey, pause, readFreeze, assertPrerequisite, observeFrozen, serialMonitor, session, type Candidate } from './workload.js';
const duration = 86_400_000;
const interval = 300_000;
let started = 0; let genesis: string | null = null; let candidate: Candidate | null = null; let priorSlot = 0; let faucetCalls = 0;
const journeys: { at: string; mint: string; recipient: string; transferSignature: string; durationMs: number; scheduleDelayMs: number }[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let monitor: ReturnType<typeof serialMonitor> | undefined;
let browserError: string | null = null;
function check() { monitor?.check(); if (browserError) throw new Error(browserError); }
async function browserJourney(page: Page, index: number, api: string, payer: string) {
  const began = Date.now(); const scheduleDelayMs = began - (started + index * interval);
  if (scheduleDelayMs > 5_000) throw new Error('Scheduled browser journey missed its five-minute cadence.');
  if (await page.locator('.wallet-rail code.address').innerText() !== payer) throw new Error('Browser memory wallet changed.');
  if (index) await page.getByRole('button', { name: 'Start a new creation', exact: true }).click();
  await page.getByRole('tab', { name: 'NFT', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Soak art ' + index);
  await page.getByLabel('Symbol', { exact: true }).fill('SOAK');
  await page.getByRole('button', { name: 'Mint test NFT', exact: true }).click();
  await page.locator('.completion strong').filter({ hasText: 'is issued and verified.' }).waitFor({ timeout: 120_000 });
  check();
  const mint = await page.locator('.completion code.address').innerText();
  const recipient = Keypair.generate().publicKey.toBase58(); // Public-only TEST recipient; no signer is stored.
  await page.getByLabel('Recipient public address').fill(recipient);
  await page.getByRole('button', { name: 'Transfer this NFT', exact: true }).click();
  // First activity changes from this issuance to this transfer. Old rows cannot
  // supply a stale successful receipt from an earlier journey.
  const row = page.locator('.activity li').first();
  await row.getByText('Asset transferred', { exact: true }).waitFor({ timeout: 30_000 });
  const href = await row.locator('a').getAttribute('href');
  const transferSignature = /^\/explorer\/tx\/([1-9A-HJ-NP-Za-km-z]+)$/.exec(href ?? '')?.[1];
  if (!transferSignature) throw new Error('Browser transfer receipt is unavailable.');
  await waitForSignature(session(api), transferSignature, 'finalized');
  const deadline = Date.now() + 60_000;
  let matched = false;
  while (Date.now() < deadline) {
    check();
    const response = await fetch(api + '/api/gallery/' + mint, { signal: AbortSignal.timeout(10_000) });
    if (response.ok && ((await response.json()) as { currentOwner?: string }).currentOwner === recipient) { matched = true; break; }
    await pause(3_000);
  }
  if (!matched) throw new Error('Soak NFT ownership did not verify in 60 seconds.');
  if (await page.locator('.wallet-rail code.address').innerText() !== payer) throw new Error('Browser memory wallet changed.');
  check();
  journeys.push({ at: new Date(began).toISOString(), mint, recipient, transferSignature, durationMs: Date.now() - began, scheduleDelayMs });
}
try {
  const { api, facts, connection } = await testInputs(); genesis = facts.expectedGenesisHash!;
  const freeze = readFreeze(api, genesis); candidate = freeze.candidate; const web = candidate.frontendOrigin!;
  const prerequisites: { name: string; at: unknown }[] = [];
  for (const name of ['load','backup-check','restart-check','pilot-agent-one','pilot-agent-two','monitoring-config','frontend-rollback','remote-negative-controls']) {
    const proof = publicJson(root, 'evidence/' + name + '.json'); assertPrerequisite(proof, name, freeze);
    prerequisites.push({ name, at: proof.at });
  }
  const clock = JSON.parse(readFileSync(resolve(root, 'docs/sprint-clock.json'), 'utf8')) as { milestones: { T0: { utc: string }; H72_candidate: { utc: string }; H144_deadline: { utc: string } } };
  const deadline = Date.parse(clock.milestones.H144_deadline.utc); const h72 = Date.parse(clock.milestones.H72_candidate.utc);
  if (Date.parse(clock.milestones.T0.utc) !== Date.parse(FIXED_T0) || deadline - Date.parse(FIXED_T0) !== 144 * 3_600_000 || h72 - Date.parse(FIXED_T0) !== 72 * 3_600_000 || Date.now() + duration > deadline) throw new Error('A full 24-hour soak must fit the original fixed deadline.');
  for (const proof of prerequisites.filter(p => ['load','backup-check','restart-check','pilot-agent-one','pilot-agent-two'].includes(p.name))) if (Date.parse(String(proof.at)) >= h72) throw new Error('Required pilot/reboot/restore/load drill did not finish before H72: ' + proof.name);
  const input = privateJson(process.env.SC_SOAK_FUNDER_FILE ?? '.data/soak-funder.json');
  if (input.api !== api || input.genesis !== genesis) throw new Error('TEST soak funder identity mismatch.');
  const funder = testKey(input);
  if (await connection.getBalance(funder.publicKey, 'confirmed') < 5_100_000_000) throw new Error('Pre-funded soak actor requires at least 5.1 TEST; no repeated public faucet.');
  priorSlot = await observeFrozen(freeze);
  async function integrity(requireProgress = true) {
    const slot = await observeFrozen(freeze);
    if (slot < priorSlot || (requireProgress && slot === priorSlot)) throw new Error('Network stalled or regressed during soak.'); priorSlot = slot;
  }
  // Validate progression and frozen identities before signing any funding.
  await pause(30_000); await integrity();
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, '.tools/playwright-browsers');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage();
  page.on('pageerror', () => { browserError ??= 'Browser application error during soak.'; });
  await context.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== api) { browserError ??= 'Production browser contacted a different API origin.'; await route.abort(); return; }
    if (url.pathname === '/api/faucet') { faucetCalls++; browserError ??= 'Unexpected public faucet call during pre-funded soak.'; await route.abort(); return; }
    await route.continue();
  });
  await page.goto(web + '/playground'); await page.getByText('Network responding', { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Create test wallet', exact: true }).click();
  await page.locator('.wallet-rail code.address').waitFor();
  const payer = new PublicKey(await page.locator('.wallet-rail code.address').innerText());
  check();
  const fundingSignature = await transferNative(connection, genesis, funder, payer.toBase58(), 5_000_000_000);
  await waitForSignature(session(api), fundingSignature, 'finalized');
  // External funding cannot refresh React's balance state; do not reload the
  // production page, since that would destroy its memory-only signer.
  if (await connection.getBalance(payer, 'confirmed') < 5_000_000_000) throw new Error('Browser TEST wallet funding did not verify.');
  if (Date.now() + duration > deadline) throw new Error('Setup consumed the remaining full-soak deadline window.');
  await integrity();
  started = Date.now(); monitor = serialMonitor(integrity);
  for (let i = 0; i < 288; i++) {
    while (Date.now() < started + i * interval) { check(); await pause(Math.min(5_000, started + i * interval - Date.now())); }
    check(); await browserJourney(page, i, api, payer.toBase58());
    evidence('soak-progress', { at: new Date().toISOString(), scope: 'remote production browser soak in progress; not accepted until 24 hours', passed: false, api, web, genesis, candidate, startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started, completedJourneys: journeys.length, observations: monitor.observations, lastSlot: priorSlot });
    console.log(`Soak journey ${i + 1}/288 verified; elapsed ${Math.floor((Date.now() - started) / 60_000)} minutes.`);
  }
  while (Date.now() - started < duration) { check(); await pause(Math.min(5_000, duration - (Date.now() - started))); }
  // Drain the in-flight monitor before final integrity and success publication.
  await monitor.stop(); check(); await integrity(false);
  if (journeys.length !== 288 || faucetCalls !== 0 || Date.now() > deadline) throw new Error('Soak completion requirements are unmet.');
  evidence('soak', { at: new Date().toISOString(), scope: 'remote uninterrupted 24-hour production-origin isolated browser TEST soak; not chainwide capacity', passed: true, api, web, genesis, candidate, runtime: freeze.runtime, prerequisites, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, smokeEveryMs: interval, observationEveryMs: 30_000, observations: monitor.observations, completedJourneys: journeys.length, payer: payer.toBase58(), fundingSignature, faucetCalls, lastSlot: priorSlot, journeys });
} catch (error) {
  evidence('soak', { at: new Date().toISOString(), scope: 'remote browser soak; prerequisites missing or interrupted, not accepted', passed: false, genesis, candidate, elapsedMs: started ? Date.now() - started : 0, completedJourneys: journeys.length, faucetCalls, journeys, error: error instanceof Error ? error.message : 'Soak failed.' }); throw error;
} finally { await monitor?.stop().catch(() => undefined); await browser?.close(); }
