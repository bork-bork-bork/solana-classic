import { Keypair } from '@solana/web3.js';
import { prepareIssuance, finishIssuance, transferAsset, waitForSignature, type Issuance } from '@solana-classic/chain';
import type { AssetDocument, ActionProgress, GalleryEntry } from '@solana-classic/config';
import { evidence } from './evidence.js';
import { testInputs, privateJson, testKey, session, post, pause, percentile, confirmedMetrics, logicalConfirmation, readFreeze, observeFrozen, serialMonitor, type Candidate } from './workload.js';
type Result = { index: number; kind: 'issuance' | 'transfer'; startedAt: string; confirmedMs: number | null; finalizedMs: number | null; galleryVerifiedMs: number | null; signatures: string[]; confirmedSignatures: string[]; passed: boolean; error?: string };
const results: Result[] = []; let genesis: string | null = null; let api = ''; let started = 0; let candidate: Candidate | null = null;
let monitor: ReturnType<typeof serialMonitor> | undefined;
try {
  const context = await testInputs(); api = context.api; genesis = context.facts.expectedGenesisHash!;
  const freeze = readFreeze(api, genesis); candidate = freeze.candidate;
  await observeFrozen(freeze);
  const input = privateJson(process.env.SC_QA_WALLETS_FILE ?? '.data/qa-wallets.json');
  if (input.genesis !== genesis || input.api !== api || !Array.isArray(input.wallets) || input.wallets.length !== 20) throw new Error('Twenty protected pre-funded sessions must match the canonical API/genesis.');
  const wallets = input.wallets.map(testKey); const sessions = wallets.map(() => session(api));
  if (new Set(wallets.map(w => w.publicKey.toBase58())).size !== 20) throw new Error('Twenty distinct session identities are required.');
  for (let i = 0; i < 20; i++) if (await sessions[i]!.getBalance(wallets[i]!.publicKey, 'confirmed') < 100_000_000) throw new Error('Each TEST session requires at least 0.1 pre-funded TEST; no faucet bypass or automatic funding.');
  // Seed assets are excluded from load credit and finish before measurement.
  const seeds: AssetDocument[] = [];
  for (let actor = 0; actor < 20; actor++) {
    const mint = Keypair.generate();
    const document = await post<AssetDocument>(api, '/api/assets', { mint: mint.publicKey.toBase58(), kind: 'meme', name: 'Load seed ' + actor, symbol: 'SEED', presetId: actor % 4 });
    const state: Issuance = { mint, document, preparationSignature: null, issuanceSignature: null };
    await prepareIssuance(sessions[actor]!, genesis, wallets[actor]!, state);
    await finishIssuance(sessions[actor]!, genesis, wallets[actor]!, state);
    seeds.push(document);
  }
  let priorSlot = await observeFrozen(freeze);
  monitor = serialMonitor(async () => {
    const slot = await observeFrozen(freeze);
    if (slot <= priorSlot) throw new Error('Network stalled during load.'); priorSlot = slot;
    await Promise.all(sessions.map((connection, actor) => connection.getBalance(wallets[actor]!.publicKey, 'confirmed')));
  });
  started = Date.now();
  async function operation(index: number) {
    const actor = Math.floor(index / 2) % 20; const wallet = wallets[actor]!; const connection = sessions[actor]!;
    const start = Date.now(); const record: Result = { index, kind: index % 2 === 0 ? 'issuance' : 'transfer', startedAt: new Date(start).toISOString(), confirmedMs: null, finalizedMs: null, galleryVerifiedMs: null, signatures: [], confirmedSignatures: [], passed: false };
    // Fresh issuances atomically prepare, mint, and revoke authorities in one
    // signed transaction; repeated progress events cannot add confirmation credit.
    const requiredConfirmations = 1;
    const confirmation = logicalConfirmation(start, requiredConfirmations); record.confirmedSignatures = confirmation.signatures;
    const report = (p: ActionProgress) => {
      if (p.signature && !record.signatures.includes(p.signature)) record.signatures.push(p.signature);
      confirmation.report(p); record.confirmedMs = confirmation.confirmedMs;
    };
    try {
      if (record.kind === 'issuance') {
        const mint = Keypair.generate(); const kind = Math.floor(index / 2) % 2 ? 'nft' : 'meme';
        const document = await post<AssetDocument>(api, '/api/assets', { mint: mint.publicKey.toBase58(), kind, name: 'Load ' + index, symbol: 'LOAD', presetId: actor % 4 });
        const state: Issuance = { mint, document, preparationSignature: null, issuanceSignature: null };
        await prepareIssuance(connection, genesis!, wallet, state, report);
        const signature = await finishIssuance(connection, genesis!, wallet, state, report);
        record.finalizedMs = Date.now() - start;
        const entry = await post<GalleryEntry>(api, '/api/gallery', { mint: document.mint, contentHash: document.contentHash, issuanceSignature: signature });
        if (entry.mint !== document.mint || entry.contentHash !== document.contentHash || entry.issuanceSignature !== signature || !Number.isFinite(Date.parse(entry.verifiedAt))) throw new Error('Gallery issuance receipt mismatch.');
        record.galleryVerifiedMs = Date.now() - start;
      } else {
        const signature = await transferAsset(connection, genesis!, wallet, seeds[actor]!, wallets[(actor + 1) % 20]!.publicKey.toBase58(), 1n, report);
        await waitForSignature(connection, signature, 'finalized');
        record.finalizedMs = Date.now() - start;
      }
      if (record.confirmedMs === null || record.confirmedSignatures.length !== requiredConfirmations) throw new Error('Logical operation is missing a required transaction confirmation.');
      record.passed = true;
    } catch (error) { record.error = error instanceof Error ? error.message : 'Logical operation failed.'; }
    results.push(record);
  }
  const active: Promise<void>[] = [];
  // Always drain started operations before failing; no detached work survives a result.
  try {
    for (let i = 0; i < 200; i++) {
      await pause(Math.max(0, started + i * 6_000 - Date.now())); monitor.check();
      active.push(operation(i));
      if (i % 10 === 0) console.log(`Started ${i + 1}/200 logical operations; ${results.length} completed.`);
    }
  } finally { await Promise.all(active); }
  await pause(Math.max(0, started + 1_200_000 - Date.now()));
  await monitor.stop();
  await observeFrozen(freeze);
  const metrics = confirmedMetrics(results, 200);
  const finalized = results.map(r => r.finalizedMs).filter((n): n is number => n !== null);
  const issuances = results.filter(r => r.kind === 'issuance');
  const galleryPassed = issuances.length === 100 && issuances.every(r => r.galleryVerifiedMs !== null && r.galleryVerifiedMs <= 60_000);
  const cadencePassed = results.length === 200 && results.every(r => Math.abs(Date.parse(r.startedAt) - (started + r.index * 6_000)) <= 1_000);
  const passed = cadencePassed && galleryPassed && results.every(r => r.passed) && metrics.successfulWithin15Seconds >= 0.99 && metrics.p95LogicalConfirmedMs !== null && metrics.p95LogicalConfirmedMs <= 5_000;
  evidence('load', { at: new Date().toISOString(), scope: 'remote bounded 20 SDK client sessions, not chainwide throughput or browser soak', passed, api, genesis, candidate, candidateRuntime: freeze.runtime, runtimeStable: true, observations: monitor.observations, cadencePassed, galleryPassed, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started, workload: { sessions: 20, issuances: 100, transfers: 100, issuanceTypes: ['meme','nft'], issuanceTransactionsPerOperation: 1, issuanceMode: 'atomic preparation, minting and immutable authority revocation', transferType: 'fungible precreated seeds', preparationMintsExcluded: seeds.map(s => s.mint), startEveryMs: 6_000, pollingMs: 3_000, unchangedAdmissionLimits: true, faucetCalls: 0 }, metrics: { ...metrics, p95LogicalFinalizedMs: percentile(finalized, 0.95), failures: results.filter(r => !r.passed).length }, timingDefinition: 'From logical start including API asset preparation and the atomic issuance transaction to its unique confirmed callback. Finalized time includes chain supply/authority verification; gallery receipt verification is measured separately from the same logical start. Missing confirmations remain in the 200-operation percentile denominator.', results: results.sort((a,b) => a.index - b.index) });
  console.log(JSON.stringify({ passed, ...metrics })); if (!passed) process.exitCode = 1;
} catch (error) {
  evidence('load', { at: new Date().toISOString(), scope: 'remote bounded SDK workload; not completed', passed: false, api, genesis, candidate, durationMs: started ? Date.now() - started : 0, completed: results.length, metrics: confirmedMetrics(results, 200), results: results.sort((a,b) => a.index - b.index), error: error instanceof Error ? error.message : 'Workload failed.' }); throw error;
} finally { await monitor?.stop().catch(() => undefined); }
