import { Keypair } from '@solana/web3.js';
import { prepareIssuance, finishIssuance, transferAsset, waitForSignature, currentNftOwner, type Issuance } from '@solana-classic/chain';
import type { AssetDocument, ActionProgress } from '@solana-classic/config';
import { evidence } from './evidence.js';
import { testInputs, privateJson, testKey, session, post, pause, percentile } from './workload.js';
const resultName = 'load';
type Result = { index: number; kind: 'issuance' | 'transfer'; startedAt: string; confirmedMs: number | null; finalizedMs: number | null; signatures: string[]; passed: boolean; error?: string };
const results: Result[] = []; let genesis: string | null = null; let api = ''; let started = 0;
try {
  const context = await testInputs(); api = context.api; genesis = context.facts.expectedGenesisHash!;
  const input = privateJson(process.env.SC_QA_WALLETS_FILE ?? '.data/qa-wallets.json');
  if (input.genesis !== genesis || input.api !== api || !Array.isArray(input.wallets) || input.wallets.length !== 20) throw new Error('Twenty protected pre-funded sessions must match the canonical API/genesis.');
  const wallets = input.wallets.map(testKey); const sessions = wallets.map(() => session(api));
  if (new Set(wallets.map(w => w.publicKey.toBase58())).size !== 20) throw new Error('Twenty distinct session identities are required.');
  for (let i = 0; i < 20; i++) if (await sessions[i]!.getBalance(wallets[i]!.publicKey, 'confirmed') < 100_000_000) throw new Error('Each TEST session requires at least0.1 pre-funded TEST; no faucet bypass or automatic funding.');
  const candidateResponse = await fetch(api + '/api/runtime'); const runtime = await candidateResponse.json() as Record<string, unknown>;
  if (!candidateResponse.ok || runtime.configured !== true || !runtime.deploymentId || !runtime.validatorBootId) throw new Error('Checksum-bound runtime identity is required before load.');
  // Transfer targets exist before measurement so their starts never wait for
  // the paired issuance's later finalization. Seed creation is not load credit.
  const seeds: AssetDocument[] = [];
  for (let actor = 0; actor < 20; actor++) {
    const mint = Keypair.generate();
    const document = await post<AssetDocument>(api, '/api/assets', { mint: mint.publicKey.toBase58(), kind: 'meme', name: 'Load seed ' + actor, symbol: 'SEED', presetId: actor % 4 });
    const state: Issuance = { mint, document, preparationSignature: null, issuanceSignature: null };
    await prepareIssuance(sessions[actor]!, genesis!, wallets[actor]!, state);
    await finishIssuance(sessions[actor]!, genesis!, wallets[actor]!, state);
    seeds.push(document);
  }
  const active: Promise<void>[] = [];
  const heartbeat = setInterval(() => { for (let actor = 0; actor < 20; actor++) void sessions[actor]!.getBalance(wallets[actor]!.publicKey, 'confirmed').catch(() => undefined); }, 30_000); heartbeat.unref();
  started = Date.now();
  async function operation(index: number) {
    const actor = Math.floor(index / 2) % 20; const wallet = wallets[actor]!; const connection = sessions[actor]!;
    const start = Date.now(); const record: Result = { index, kind: index % 2 === 0 ? 'issuance' : 'transfer', startedAt: new Date(start).toISOString(), confirmedMs: null, finalizedMs: null, signatures: [], passed: false };
    const report = (p: ActionProgress) => { if (p.signature && !record.signatures.includes(p.signature)) record.signatures.push(p.signature); if (p.phase === 'confirmed') record.confirmedMs = Date.now() - start; };
    try {
      if (index % 2 === 0) {
        const mint = Keypair.generate(); const kind = Math.floor(index / 2) % 2 ? 'nft' : 'meme';
        const document = await post<AssetDocument>(api, '/api/assets', { mint: mint.publicKey.toBase58(), kind, name: 'Load ' + index, symbol: 'LOAD', presetId: actor % 4 });
        const state: Issuance = { mint, document, preparationSignature: null, issuanceSignature: null };
        await prepareIssuance(connection, genesis!, wallet, state, report);
        const signature = await finishIssuance(connection, genesis!, wallet, state, report);
        await post(api, '/api/gallery', { mint: document.mint, contentHash: document.contentHash, issuanceSignature: signature });
      } else {
        const document = seeds[actor]!;
        const signature = await transferAsset(connection, genesis!, wallet, document, wallets[(actor + 1) % 20]!.publicKey.toBase58(), 1n, report);
        await waitForSignature(connection, signature, 'finalized');
        if (document.kind === 'nft' && await currentNftOwner(connection, document.mint) !== wallets[(actor + 1) % 20]!.publicKey.toBase58()) throw new Error('Transferred NFT owner mismatch.');
      }
      record.finalizedMs = Date.now() - start; record.passed = true;
    } catch (error) { record.error = error instanceof Error ? error.message : 'Logical operation failed.'; }
    results.push(record);
  }
  for (let i = 0; i < 200; i++) {
    await pause(Math.max(0, started + i * 6_000 - Date.now()));
    active.push(operation(i));
    if (i % 10 === 0) console.log(`Started${i + 1}/200 logical operations; ${results.length} completed.`);
  }
  await Promise.all(active); clearInterval(heartbeat); await pause(Math.max(0, started + 1_200_000 - Date.now()));
  const current = await fetch(api + '/api/runtime').then(r => r.json()) as Record<string, unknown>;
  const runtimeStable = ['deploymentId','coreSha256','apiBootId','validatorBootId'].every(k => current[k] === runtime[k]);
  const confirmed = results.map(r => r.confirmedMs).filter((n): n is number => n !== null);
  const within15 = results.filter(r => r.passed && r.confirmedMs !== null && r.confirmedMs <= 15_000).length / 200;
  const p95 = percentile(confirmed, 0.95); const finalized = results.map(r => r.finalizedMs).filter((n): n is number => n !== null);
  const cadencePassed = results.every(r => Math.abs(Date.parse(r.startedAt) - (started + r.index * 6_000)) <= 1_000);
  const passed = runtimeStable && cadencePassed && results.length === 200 && within15 >= 0.99 && p95 !== null && p95 <= 5_000 && finalized.every(n => n <= 60_000);
  evidence(resultName, { at: new Date().toISOString(), scope: 'remote bounded20 SDK client sessions, not chainwide throughput or browser soak', passed, api, genesis, candidateRuntime: runtime, runtimeStable, cadencePassed, durationMs: Date.now() - started, workload: { sessions: 20, issuances: 100, transfers: 100, issuanceTypes: ['meme','nft'], transferType: 'fungible precreated seeds', preparationMintsExcluded: seeds.map(s => s.mint), startEveryMs: 6_000, pollingMs: 3_000, unchangedAdmissionLimits: true, faucetCalls: 0 }, metrics: { successfulWithin15Seconds: within15, p95LogicalConfirmedMs: p95, p95LogicalFinalizedMs: percentile(finalized, 0.95), failures: results.filter(r => !r.passed).length }, timingDefinition: 'From start of logical operation, including asset preparation and both issuance transactions, to last confirmed callback; finalized includes gallery/ownership verification separately.', results: results.sort((a,b) => a.index - b.index) });
  console.log(JSON.stringify({ passed, within15, p95LogicalConfirmedMs: p95 })); if (!passed) process.exitCode = 1;
} catch (error) {
  evidence(resultName, { at: new Date().toISOString(), scope: 'remote bounded SDK workload; not completed', passed: false, api, genesis, durationMs: started ? Date.now() - started : 0, completed: results.length, error: error instanceof Error ? error.message : 'Workload failed.' }); throw error;
}
