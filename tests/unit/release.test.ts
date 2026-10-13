import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluateRelease, FIXED_T0, sha256 } from '../../scripts/release-check';
import { createReleasePacket, sanitizePublic } from '../../scripts/release-packet';

// Synthetic records test evaluator behavior only; none are real acceptance evidence.
describe('release evaluation and public packet (temporary synthetic records only)', () => {
  let root: string;
  const now = new Date('2026-10-13T10:00:54Z');
  const genesis = 'synthetic-private-genesis';
  let manifest: Record<string, unknown>;
  let proof: Record<string, unknown>;

  function writeJson(path: string, value: unknown) {
    const full = resolve(root, path); mkdirSync(resolve(full, '..'), { recursive: true }); writeFileSync(full, JSON.stringify(value));
  }
  function updateProof() {
    writeJson('evidence/remote-proof.json', proof);
    const digest = sha256(readFileSync(resolve(root, 'evidence/remote-proof.json')));
    for (const item of Object.values(manifest.requirements as Record<string, { proofs: { path: string; sha256: string }[] }>)) item.proofs = [{ path: 'evidence/remote-proof.json', sha256: digest }];
    writeJson('evidence/acceptance-gates.json', manifest);
  }
  beforeEach(() => {
    root = mkdtempSync('/private/tmp/solana-classic-release-fixture-');
    mkdirSync(resolve(root, 'docs/planning'), { recursive: true });
    const checklist = Array.from({ length: 8 }, (_, index) => `## G${index} synthetic requirement\n\n- [ ] Synthetic individual check ${index}.\n`).join('\n') + '- [ ] pnpm release:check passes all requirements.\n';
    writeFileSync(resolve(root, 'docs/planning/ACCEPTANCE_CHECKLIST.md'), checklist);
    writeJson('docs/sprint-clock.json', { milestones: { T0: { utc: FIXED_T0, elapsed_hours: 0 }, H144_deadline: { utc: '2026-10-19T03:00:54Z', elapsed_hours: 144 } } });
    writeJson('config/network.remote.json', { mode: 'remote', expectedGenesisHash: genesis, denomination: 'TEST', operatorCount: 1, hasMonetaryValue: false });
    writeJson('docs/dependency-manifest.json', { runtime: 'synthetic manifest only' });
    writeJson('docs/planning/launch-inputs.json', { external_inputs: { operator_contact: 'Private alert chosen', backup_destination: 'Chosen', repository_destination: 'Chosen' } });
    writeJson('config/launch.json', { status: 'not_launched', initialAsset: { mintAddress: null }, nativeAsset: { status: 'planned_not_launched' }, bridge: { status: 'proposed_not_implemented' } });
    const candidate = { apiOrigin: 'https://api.example.test', frontendOrigin: 'https://web.example.test', frontendDeploymentId: 'synthetic-deployment', frontendCommit: 'a'.repeat(40), apiCommit: 'b'.repeat(40), networkConfigSha256: sha256(readFileSync(resolve(root, 'config/network.remote.json'))), dependencyManifestSha256: sha256(readFileSync(resolve(root, 'docs/dependency-manifest.json'))) };
    manifest = { schemaVersion: 1, scope: 'remote-experimental', genesis, checklistSha256: sha256(readFileSync(resolve(root, 'docs/planning/ACCEPTANCE_CHECKLIST.md'))), candidate, requirements: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`G${index}.01`, { passed: true, scope: 'remote', verifiedAt: now.toISOString(), proofs: [] }])) };
    proof = { passed: true, scope: 'remote', genesis, candidate, api: candidate.apiOrigin, web: candidate.frontendOrigin };
    updateProof();
    for (const pilot of ['pilot-agent-one', 'pilot-agent-two']) writeJson(`evidence/${pilot}.json`, { passed: true, scope: 'remote independent agent browser pilot', genesis });
    for (const file of ['config/network.json', 'docs/agave-release.json', 'docs/agave-compatibility-release.json', 'docs/token-program-release.json', 'docs/resolved-package-versions.json', 'package.json', 'vercel.json']) writeJson(file, {});
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('fails closed when the individual gate manifest is absent despite a passed aggregate result', () => {
    rmSync(resolve(root, 'evidence/acceptance-gates.json'));
    writeJson('evidence/local-qa-summary.json', { passed: true, scope: 'local fixtures', passed_tests: 10_000 });
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(false);
    expect(report.gates.every(gate => !gate.passed)).toBe(true);
  });

  it('evaluates every individual synthetic requirement and avoids a circular release-check prerequisite', () => {
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(true);
    expect(report.requirements.find(item => item.label.includes('release:check'))?.passed).toBe(true);
    expect(report.releaseStates.pumpToken).toContain('not verified');
    expect(report.releaseStates.bridge).toContain('not verified');
    expect(report.unresolvedInputs).toContain('separate_authorized_Pump_token_creation');
  });

  it('does not accept local fixture proofs relabelled by a remote gate attestation', () => {
    proof.scope = 'local mock integration; no remote chain gate'; updateProof();
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(false);
    expect(report.requirements.find(item => item.id === 'G1.01')?.reason).toContain('Local/fixture');
  });

  it('requires both independently labelled remote agent pilot records even if gate attestations say passed', () => {
    rmSync(resolve(root, 'evidence/pilot-agent-two.json'));
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(false);
    expect(report.requirements.find(item => item.label.includes('release:check'))?.passed).toBe(false);
    expect(report.unresolvedInputs).toContain('pilot-agent-two_remote_browser_evidence');
  });

  it('rejects changed proof bytes without updated checksums', () => {
    writeJson('evidence/remote-proof.json', { ...proof, changed: true });
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(false);
    expect(report.requirements[0]?.reason).toContain('checksum');
  });

  it('rejects attestations from an earlier checklist even when requirement IDs still exist', () => {
    const path = resolve(root, 'docs/planning/ACCEPTANCE_CHECKLIST.md');
    writeFileSync(path, readFileSync(path, 'utf8').replace('Synthetic individual check 0.', 'A changed source requirement.'));
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(false);
    expect(report.issues.join(' ')).toContain('current acceptance checklist');
  });

  it('rejects a failed underlying proof even when its checksum and gate attestation match', () => {
    proof.passed = false; updateProof();
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(false);
    expect(report.requirements[0]?.reason).toContain('not passed');
  });

  it('requires all frozen candidate fields to match stability evidence', () => {
    proof.candidate = { ...(manifest.candidate as Record<string, unknown>), frontendDeploymentId: 'older-deployment' }; updateProof();
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(false);
    expect(report.requirements.find(item => item.id === 'G6.01')?.reason).toContain('frozen candidate');
  });

  it('rejects evidence bound to a different API origin', () => {
    proof.api = 'https://retained-probe.example.test'; updateProof();
    expect(evaluateRelease(root, now).requirements[0]?.reason).toContain('different API');
  });

  it('rejects shifted T0/deadline pairs even if their duration remains 144 hours', () => {
    writeJson('docs/sprint-clock.json', { milestones: { T0: { utc: '2026-10-14T03:00:54Z', elapsed_hours: 0 }, H144_deadline: { utc: '2026-10-20T03:00:54Z', elapsed_hours: 144 } } });
    const report = evaluateRelease(root, now);
    expect(report.passed).toBe(false);
    expect(report.clock.deadline).toBeNull();
  });

  it('fails the release when the fixed deadline has elapsed', () => {
    const report = evaluateRelease(root, new Date('2026-10-20T00:00:00Z'));
    expect(report.passed).toBe(false);
    expect(report.clock.full24HourSoakFits).toBe(false);
    expect(report.issues.join(' ')).toContain('H144 deadline');
  });

  it('rejects symlinked proof files without reading their target', () => {
    rmSync(resolve(root, 'evidence/remote-proof.json'));
    symlinkSync(resolve(root, 'config/launch.json'), resolve(root, 'evidence/remote-proof.json'));
    expect(evaluateRelease(root, now).requirements[0]?.reason).toContain('linked');
  });

  it('builds a sanitized packet and removes stale output without collecting private roots', () => {
    writeFileSync(resolve(root, '.env'), 'PASSWORD=do-not-export');
    writeJson('.data/wallet.json', { secretKey: 'never-export' });
    writeJson('evidence/operator-private-key.json', { privateKey: 'never-export' });
    proof.secretKey = 'sensitive-secret-value'; proof.operatorContact = 'operator@example.test'; proof.rawBytes = Array(64).fill(42); updateProof();
    mkdirSync(resolve(root, 'evidence/release-packet'), { recursive: true });
    writeFileSync(resolve(root, 'evidence/release-packet/.env'), 'stale-private-output');
    const packet = createReleasePacket(root, now);
    const output = resolve(root, packet.destination);
    expect(readdirSync(output)).not.toContain('.env');
    expect(packet.inventory.some(item => /(?:\.data|\.env|private-key)/.test(item.source))).toBe(false);
    const copied = readFileSync(resolve(output, 'evidence__remote-proof.json'), 'utf8');
    expect(copied).not.toContain('sensitive-secret-value');
    expect(copied).not.toContain('operator@example.test');
    expect(copied).toContain('[REDACTED key material]');
    expect(packet.inventory.find(item => item.source === 'evidence/remote-proof.json')?.sourceSha256).not.toBe(packet.inventory.find(item => item.source === 'evidence/remote-proof.json')?.sanitizedSha256);
  });

  it('strips opaque URL parameters while retaining public metadata fields', () => {
    expect(sanitizePublic({ tokenProgram: 'public-program', url: 'https://api.example.test/?token=opaque#state', environment: { SECRET: 'private' } })).toEqual({ tokenProgram: 'public-program', url: 'https://api.example.test/', environment: '[REDACTED]' });
  });
});
