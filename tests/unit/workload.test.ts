import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync, linkSync } from 'node:fs';
import { resolve } from 'node:path';
import { Connection, Keypair } from '@solana/web3.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertCoreFiles, assertPrerequisite, confirmedMetrics, digest, logicalConfirmation, percentile, pollAtThreeSeconds, privateJson, serialMonitor, testKey, validateFreeze, validateRuntime, type Freeze } from '../../scripts/workload';

// Temporary synthetic inputs exercise safeguards only; these are not live proof.
const temporary: string[] = [];
function workspace() { const dir = mkdtempSync('/private/tmp/workload-unit-'); temporary.push(dir); mkdirSync(resolve(dir, '.data')); return dir; }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('workload timing and confirmation denominators', () => {
  it('credits one atomic issuance receipt once and preserves its confirmation latency', () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000); const clock = logicalConfirmation(Date.now(), 1);
    vi.setSystemTime(103_000); clock.report({ phase: 'confirmed', signature: 'atomic-issuance' });
    vi.setSystemTime(113_000); clock.report({ phase: 'complete', signature: 'atomic-issuance' }); clock.report({ phase: 'confirmed', signature: 'atomic-issuance' });
    expect(clock.confirmedMs).toBe(3_000); expect(clock.signatures).toEqual(['atomic-issuance']);
  });
  it('does not count preparation or duplicate callbacks as a completed two-transaction issuance', () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000); const clock = logicalConfirmation(Date.now(), 2);
    clock.report({ phase: 'preparing', signature: 'prepare' });
    vi.setSystemTime(102_000); clock.report({ phase: 'confirmed', signature: 'prepare' });
    clock.report({ phase: 'confirmed', signature: 'prepare' }); expect(clock.confirmedMs).toBeNull();
    vi.setSystemTime(106_000); clock.report({ phase: 'confirmed', signature: 'issue' });
    expect(clock.confirmedMs).toBe(6_000); expect(clock.signatures).toEqual(['prepare','issue']);
  });
  it('uses nearest-rank p95 without dropping the twentieth observation', () => {
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 0.95)).toBe(19);
    expect(percentile([], 0.95)).toBeNull();
  });
  it('keeps absent, invalid, and unconfirmed operations in the full workload denominator', () => {
    const results = [...Array.from({ length: 180 }, () => ({ confirmedMs: 1_000 })), { confirmedMs: null }, { confirmedMs: NaN }, { confirmedMs: -1 }];
    expect(confirmedMetrics(results, 200)).toEqual({ successfulWithin15Seconds: 0.9, p95LogicalConfirmedMs: null, missingConfirmations: 20 });
  });
  it('does not replace the strict 99 percent deadline with an average', () => {
    const results = Array.from({ length: 200 }, (_, i) => ({ confirmedMs: i < 197 ? 4_000 : 15_001 }));
    expect(confirmedMetrics(results, 200)).toEqual({ successfulWithin15Seconds: 0.985, p95LogicalConfirmedMs: 4_000, missingConfirmations: 0 });
  });
  it('reserves concurrent signature polling across changed batches at real three-second intervals', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const connection = new Connection('https://synthetic.example.test'); const calls: { at: number; signatures: string[] }[] = [];
    vi.spyOn(connection, 'getSignatureStatuses').mockImplementation(async signatures => { calls.push({ at: Date.now(), signatures }); return { context: { slot: 1 }, value: signatures.map(() => null) }; });
    pollAtThreeSeconds(connection);
    const pending = [connection.getSignatureStatuses(['a']), connection.getSignatureStatuses(['a','b']), connection.getSignatureStatuses(['b'])];
    await vi.advanceTimersByTimeAsync(6_000); await Promise.all(pending);
    expect(calls).toEqual([{ at: 100_000, signatures: ['a'] }, { at: 103_000, signatures: ['a','b'] }, { at: 106_000, signatures: ['b'] }]);
  });
  it('drains a late failing monitor and does not overlap slow observations', async () => {
    vi.useFakeTimers();
    let reject!: (cause: Error) => void; let running = 0; let peak = 0;
    const monitor = serialMonitor(async () => { running++; peak = Math.max(peak, running); try { await new Promise<void>((_resolve, no) => { reject = no; }); } finally { running--; } }, 30_000);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(peak).toBe(1);
    const stopped = monitor.stop(); const checked = expect(stopped).rejects.toThrow('late failure');
    reject(new Error('late failure')); await checked;
    expect(() => monitor.check()).toThrow('late failure');
    await vi.advanceTimersByTimeAsync(90_000); expect(peak).toBe(1);
  });
});

describe('protected TEST wallet inputs', () => {
  it('only reads bounded private regular files inside the QA data directory', () => {
    const dir = workspace(); const file = resolve(dir, '.data/qa.json');
    writeFileSync(file, JSON.stringify({ marker: 'synthetic QA input' }), { mode: 0o600 });
    expect(privateJson('.data/qa.json', dir)).toEqual({ marker: 'synthetic QA input' });
    chmodSync(file, 0o644); expect(() => privateJson('.data/qa.json', dir)).toThrow('owner-private');
    expect(() => privateJson('/outside/real-wallet.json', dir)).toThrow('under ignored .data');
    expect(() => privateJson('.data/../real-wallet.json', dir)).toThrow('under ignored .data');
  });
  it('rejects file and ancestor symlinks and shared hard links', () => {
    const dir = workspace(); const file = resolve(dir, '.data/qa.json'); writeFileSync(file, '{}', { mode: 0o600 });
    symlinkSync(file, resolve(dir, '.data/alias.json')); expect(() => privateJson('.data/alias.json', dir)).toThrow('symlinks');
    symlinkSync(resolve(dir, '.data'), resolve(dir, '.data/linked')); expect(() => privateJson('.data/linked/qa.json', dir)).toThrow('symlinks');
    linkSync(file, resolve(dir, '.data/shared.json')); expect(() => privateJson('.data/shared.json', dir)).toThrow('owner-private');
  });
  it('rejects oversized keys and mismatched public identities without exposing key bytes', () => {
    const dir = workspace(); writeFileSync(resolve(dir, '.data/large.json'), 'x'.repeat(100_001), { mode: 0o600 });
    expect(() => privateJson('.data/large.json', dir)).toThrow('bounded');
    const key = Keypair.generate();
    expect(() => testKey({ publicKey: Keypair.generate().publicKey.toBase58(), secretKey: [...key.secretKey] })).toThrow('identity mismatch');
    expect(() => testKey({ publicKey: key.publicKey.toBase58(), secretKey: Array(64).fill(256) })).toThrow('format');
    writeFileSync(resolve(dir, '.data/broken.json'), '{"secretKey":DO-NOT-LOG}', { mode: 0o600 });
    expect(() => privateJson('.data/broken.json', dir)).toThrow(/^Protected TEST input is not valid JSON\.$/);
  });
});

function syntheticFreeze(dir: string): Freeze {
  mkdirSync(resolve(dir, 'config')); mkdirSync(resolve(dir, 'docs')); mkdirSync(resolve(dir, 'scripts'));
  writeFileSync(resolve(dir, 'config/network.remote.json'), '{}'); writeFileSync(resolve(dir, 'docs/dependency-manifest.json'), '{}'); writeFileSync(resolve(dir, 'scripts/test.ts'), '// synthetic');
  const candidate = { apiOrigin: 'https://api.example.test', frontendOrigin: 'https://web.example.test', frontendDeploymentId: 'synthetic-deployment', apiCommit: 'a'.repeat(40), frontendCommit: 'b'.repeat(40), networkConfigSha256: digest(Buffer.from('{}')), dependencyManifestSha256: digest(Buffer.from('{}')) };
  const coreFiles: Record<string, string> = { 'scripts/test.ts': digest(Buffer.from('// synthetic')) };
  const coreSha256 = digest(Buffer.from(JSON.stringify(coreFiles)));
  const build = JSON.stringify({ sourceCommit: candidate.apiCommit, coreSha256, files: { ...coreFiles } });
  writeFileSync(resolve(dir, 'config/runtime-build.json'), build); coreFiles['config/runtime-build.json'] = digest(Buffer.from(build));
  for (const path of ['scripts/load.ts','scripts/soak.ts','scripts/workload.ts']) { writeFileSync(resolve(dir, path), '// synthetic control'); coreFiles[path] = digest(Buffer.from('// synthetic control')); }
  return { passed: true, scope: 'remote synthetic input for unit validation only', genesis: 'synthetic-genesis', frozenAt: '2026-10-13T03:00:54Z', candidate, runtime: { configured: true, genesis: 'synthetic-genesis', sourceCommit: candidate.apiCommit, coreSha256, deploymentId: 'synthetic-runtime', apiBootId: 'synthetic-api-boot', apiStartedAt: '2026-10-13T03:00:54Z', validatorBootId: 'synthetic-validator-boot', validatorStartedAt: '2026-10-13T03:00:54Z', agaveVersion: 'synthetic', tokenProgramVersion: 'synthetic', tokenProgramSha256: 'd'.repeat(64) }, coreFiles, frontendFiles: { '/': 'e'.repeat(64), '/assets/synthetic.js': 'f'.repeat(64) } };
}
describe('frozen candidate and prerequisite safeguards', () => {
  it('requires complete checksums and refuses runtime-only or different frontend proofs', () => {
    const dir = workspace(); const freeze = syntheticFreeze(dir); const now = Date.parse('2026-10-13T05:00:54Z');
    expect(validateFreeze(freeze, freeze.candidate.apiOrigin!, freeze.genesis, dir, now)).toBe(freeze);
    const proof = { passed: true, scope: 'remote', genesis: freeze.genesis, at: '2026-10-13T04:00:54Z', candidate: { ...freeze.candidate } };
    expect(() => assertPrerequisite(proof, 'synthetic', freeze, now)).not.toThrow();
    expect(() => assertPrerequisite({ ...proof, candidate: undefined, candidateRuntime: freeze.runtime }, 'synthetic', freeze, now)).toThrow('candidate-bound');
    expect(() => assertPrerequisite({ ...proof, candidate: { ...freeze.candidate, frontendDeploymentId: 'different' } }, 'synthetic', freeze, now)).toThrow('candidate-bound');
    expect(() => assertPrerequisite({ ...proof, scope: 'local mock remote' }, 'synthetic', freeze, now)).toThrow('candidate-bound');
  });
  it('fails closed on absent deployment identities, configuration changes and source mutations', () => {
    const dir = workspace(); const freeze = syntheticFreeze(dir);
    expect(() => validateRuntime({ ...freeze.runtime, apiBootId: undefined }, freeze.candidate, freeze.genesis)).toThrow('runtime identity');
    expect(() => validateRuntime({ ...freeze.runtime, sourceCommit: 'x'.repeat(40) }, freeze.candidate, freeze.genesis)).toThrow('runtime identity');
    writeFileSync(resolve(dir, 'config/network.remote.json'), '{"changed":true}');
    expect(() => validateFreeze(freeze, freeze.candidate.apiOrigin!, freeze.genesis, dir)).toThrow('configuration changed');
    writeFileSync(resolve(dir, 'scripts/test.ts'), '// changed'); expect(() => assertCoreFiles(freeze, dir)).toThrow('Core source changed');
  });
  it('rejects traversal paths and an unobservable production frontend', () => {
    const dir = workspace(); const freeze = syntheticFreeze(dir);
    expect(() => assertCoreFiles({ ...freeze, coreFiles: { 'scripts/../secret.ts': 'a'.repeat(64) } }, dir)).toThrow('Invalid frozen core');
    expect(() => validateFreeze({ ...freeze, frontendFiles: {} }, freeze.candidate.apiOrigin!, freeze.genesis, dir)).toThrow('frontend asset checksums');
    const omitted = { ...freeze, coreFiles: { ...freeze.coreFiles } }; delete omitted.coreFiles['scripts/test.ts'];
    expect(() => validateFreeze(omitted, freeze.candidate.apiOrigin!, freeze.genesis, dir)).toThrow('omits runtime source');
  });
});
