import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { KNOWN_PUBLIC_GENESIS } from '@solana-classic/chain';

export const RELEASE_ROOT = resolve(import.meta.dirname, '..');
export const MAX_PUBLIC_BYTES = 1_048_576;
export const FIXED_T0 = '2026-10-13T03:00:54Z';
type Json = Record<string, unknown>;
export type Requirement = { id: string; gate: string; label: string; passed: boolean; reason: string };
export type ReleaseReport = {
  at: string; passed: boolean; scope: 'offline evidence review'; issues: string[]; requirements: Requirement[];
  gates: { id: string; passed: boolean; passedChecks: number; requiredChecks: number }[];
  clock: { startedAt: string | null; deadline: string | null; hoursRemaining: number | null; full24HourSoakFits: boolean };
  releaseStates: { experimental: string; pumpToken: string; nativeMainnet: string; bridge: string };
  unresolvedInputs: string[]; genesis: string | null;
  supportingEvidence: { path: string; passed: boolean | null; canonicalGenesis: boolean; scope: string }[];
};
export function publicBytes(root: string, relative: string): Buffer {
  if (!( /^(?:evidence|config|docs)\/[A-Za-z0-9_./-]+$/.test(relative) || ['CONTRIBUTING.md', 'package.json', 'vercel.json'].includes(relative)) || relative.split('/').some(part => part === '..' || part.startsWith('.'))) throw new Error('Not an allowed public path.');
  let current = root;
  for (const part of relative.split('/')) { current = resolve(current, part); if (lstatSync(current).isSymbolicLink()) throw new Error('Public packet paths cannot be symlinks.'); }
  const stat = lstatSync(current);
  if (!stat.isFile() || stat.size > MAX_PUBLIC_BYTES) throw new Error('Public evidence must be a bounded regular file.');
  return readFileSync(current);
}
export function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function object(value: unknown): Json { return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}; }
export function publicJson(root: string, path: string): Json { return object(JSON.parse(publicBytes(root, path).toString('utf8'))); }
export function checklistRequirements(text: string): Requirement[] {
  const items: Requirement[] = []; let gate = ''; let count = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) { gate = /^## (G[0-7])\b/.exec(line)?.[1] ?? ''; count = 0; }
    if (gate && /^- \[[ xX]\] /.test(line)) items.push({ id: `${gate}.${String(++count).padStart(2, '0')}`, gate, label: line.slice(6), passed: false, reason: 'No passed, individually reviewed evidence.' });
  }
  return items;
}
function httpsOrigin(value: unknown): boolean {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password; } catch { return false; }
}
export function evaluateRelease(root = RELEASE_ROOT, now = new Date()): ReleaseReport {
  const issues: string[] = [];
  const read = (path: string): Json => { try { return publicJson(root, path); } catch { issues.push(`Missing or invalid public input: ${path}`); return {}; } };
  let requirements: Requirement[] = [];
  try { requirements = checklistRequirements(publicBytes(root, 'docs/planning/ACCEPTANCE_CHECKLIST.md').toString('utf8')); } catch { issues.push('Acceptance checklist is missing or invalid.'); }
  for (let gate = 0; gate < 8; gate++) if (!requirements.some(item => item.gate === `G${gate}`)) issues.push(`Checklist has no requirements for G${gate}.`);
  const clock = read('docs/sprint-clock.json'); const milestones = object(clock.milestones);
  const start = object(milestones.T0); const finish = object(milestones.H144_deadline);
  const started = Date.parse(String(start.utc)); const deadline = Date.parse(String(finish.utc));
  const validClock = started === Date.parse(FIXED_T0) && Number.isFinite(deadline) && deadline - started === 144 * 3_600_000 && start.elapsed_hours === 0 && finish.elapsed_hours === 144;
  if (!validClock) issues.push('Fixed T0/H144 clock is invalid; it must retain the original 144-hour interval.');
  if (validClock && now.getTime() > deadline) issues.push('The fixed H144 deadline has elapsed; deliver verified scope and failures.');
  const network = read('config/network.remote.json');
  const genesis = typeof network.expectedGenesisHash === 'string' ? network.expectedGenesisHash : null;
  if (network.mode !== 'remote' || !genesis || KNOWN_PUBLIC_GENESIS.has(genesis) || network.hasMonetaryValue !== false || network.denomination !== 'TEST' || network.operatorCount !== 1) issues.push('Canonical remote TEST identity is absent or unsafe.');
  const manifest = read('evidence/acceptance-gates.json'); const candidate = object(manifest.candidate);
  if (manifest.schemaVersion !== 1 || manifest.scope !== 'remote-experimental' || manifest.genesis !== genesis) issues.push('Individual gate manifest must bind schemaVersion 1 and the canonical remote experimental genesis.');
  try { if (manifest.checklistSha256 !== sha256(publicBytes(root, 'docs/planning/ACCEPTANCE_CHECKLIST.md'))) issues.push('Gate attestations do not bind the current acceptance checklist.'); } catch { /* Missing checklist is reported above. */ }
  for (const key of ['apiOrigin', 'frontendOrigin']) if (!httpsOrigin(candidate[key])) issues.push(`Candidate ${key} must be a permanent HTTPS origin.`);
  for (const key of ['frontendCommit', 'apiCommit']) if (!/^[a-f0-9]{40}$/.test(String(candidate[key]))) issues.push(`Candidate ${key} must identify its deployed source commit.`);
  if (typeof candidate.frontendDeploymentId !== 'string' || !candidate.frontendDeploymentId) issues.push('Candidate frontend deployment ID is missing.');
  for (const [key, path] of [['networkConfigSha256', 'config/network.remote.json'], ['dependencyManifestSha256', 'docs/dependency-manifest.json']] as const) {
    try { if (candidate[key] !== sha256(publicBytes(root, path))) issues.push(`Candidate digest differs from ${path}.`); } catch { issues.push(`Candidate public manifest missing: ${path}`); }
  }
  const attestations = object(manifest.requirements);
  const proofCache = new Map<string, { bytes: Buffer; json: Json }>();
  for (const requirement of requirements) {
    if (requirement.label.includes('release:check')) continue; // Derived below; requiring this command's prior pass would be circular.
    const record = object(attestations[requirement.id]);
    const scope = record.scope;
    // These particular requirements concern source/disclosures or preparation, rather than live-chain behavior.
    const reviewRequirements = new Set(['G1.07', 'G3.09', 'G4.06', 'G4.08', 'G5.10', 'G5.11', 'G6.09', 'G6.11']);
    const remoteRequired = !reviewRequirements.has(requirement.id) && (['G1', 'G2', 'G3', 'G4', 'G5', 'G6'].includes(requirement.gate) || ['G7.01', 'G7.02', 'G7.03', 'G7.04'].includes(requirement.id));
    const verified = Date.parse(String(record.verifiedAt));
    if (record.passed !== true || !['remote', 'repository', 'operator'].includes(String(scope)) || (remoteRequired && scope !== 'remote') || !Number.isFinite(verified) || verified < started || verified > now.getTime() + 5_000) continue;
    if (!Array.isArray(record.proofs) || record.proofs.length < 1 || record.proofs.length > 10) { requirement.reason = 'A bounded list of checksum-bound JSON proofs is required.'; continue; }
    let problem = '';
    for (const value of record.proofs) {
      const proof = object(value); const path = typeof proof.path === 'string' ? proof.path : '';
      if (!/^evidence\/[a-z0-9][a-z0-9._-]*\.json$/i.test(path) || /(?:acceptance-gates|release-check|release-packet)\.json$/.test(path)) { problem = 'Proof must reference a public JSON result, not a release aggregate.'; break; }
      try {
        let result = proofCache.get(path);
        if (!result) { const bytes = publicBytes(root, path); result = { bytes, json: object(JSON.parse(bytes.toString('utf8'))) }; proofCache.set(path, result); }
        const proofScope = String(result.json.scope ?? '');
        if (sha256(result.bytes) !== proof.sha256 || result.json.passed !== true) { problem = 'Proof checksum differs or its result is not passed.'; break; }
        if (scope === 'remote' && /(?:fixture|mock|no remote|not remote|local)/i.test(proofScope)) { problem = 'Local/fixture evidence cannot certify remote release requirements.'; break; }
        if (scope === 'remote' && (!/(?:remote|production-origin)/i.test(proofScope) || result.json.genesis !== genesis)) { problem = 'Remote proof must bind the canonical genesis and remote scope.'; break; }
        if (scope === 'remote' && ((result.json.api && result.json.api !== candidate.apiOrigin) || (result.json.web && result.json.web !== candidate.frontendOrigin))) { problem = 'Remote proof identifies a different API or frontend origin.'; break; }
        if (requirement.gate === 'G6') {
          const frozen = object(result.json.candidate);
          if (Object.keys(candidate).some(key => frozen[key] !== candidate[key])) { problem = 'Stability proof must bind the complete frozen candidate.'; break; }
        }
        if (scope !== 'remote' && !/(?:repository|operator|source review|handover)/i.test(proofScope)) { problem = 'Repository/operator proof must explicitly identify its review scope.'; break; }
      } catch { problem = 'Referenced proof is missing, oversized, linked or invalid.'; break; }
    }
    requirement.passed = !problem; requirement.reason = problem || 'Passed individual evidence review; checksums match.';
  }
  const inputs = read('docs/planning/launch-inputs.json'); const external = object(inputs.external_inputs); const launch = read('config/launch.json');
  const unresolvedInputs: string[] = [];
  for (const key of ['operator_contact', 'repository_destination', 'backup_destination']) if (!external[key]) unresolvedInputs.push(key);
  for (const pilot of ['pilot-agent-one', 'pilot-agent-two']) {
    try {
      const result = publicJson(root, `evidence/${pilot}.json`); const scope = String(result.scope ?? '');
      if (result.passed !== true || result.genesis !== genesis || !/agent/i.test(scope) || !/(?:remote|production-origin)/i.test(scope) || /(?:local|fixture|mock)/i.test(scope)) throw new Error('Not passed remote agent evidence.');
    } catch { unresolvedInputs.push(`${pilot}_remote_browser_evidence`); issues.push(`Passed canonical remote agent browser pilot missing: evidence/${pilot}.json`); }
  }
  const initial = object(launch.initialAsset); const native = object(launch.nativeAsset); const bridge = object(launch.bridge);
  if (!initial.mintAddress) unresolvedInputs.push('separate_authorized_Pump_token_creation');
  if (!object(initial.developerHoldings).acquisitionMethod) unresolvedInputs.push('SOC_developer_holdings_and_acquisition');
  if (!native.supplyPolicy || !native.bridgeReservePolicy || !bridge.securityModel) unresolvedInputs.push('native_SOC_supply_reserve_and_bridge_security_design');
  const nonCircularPassed = issues.length === 0 && requirements.length > 0 && requirements.filter(item => !item.label.includes('release:check')).every(item => item.passed);
  for (const item of requirements.filter(item => item.label.includes('release:check'))) { item.passed = nonCircularPassed; item.reason = nonCircularPassed ? 'Derived from every other required check and global identity/candidate checks.' : 'Every other required check must pass first.'; }
  const gates = Array.from({ length: 8 }, (_, index) => { const id = `G${index}`; const checks = requirements.filter(item => item.gate === id); return { id, passed: checks.length > 0 && checks.every(item => item.passed), passedChecks: checks.filter(item => item.passed).length, requiredChecks: checks.length }; });
  const passed = issues.length === 0 && gates.every(gate => gate.passed);
  const supportingEvidence: ReleaseReport['supportingEvidence'] = [];
  for (const name of ['chain-smoke-remote', 'browser-remote', 'restart-check', 'pilot-agent-one', 'pilot-agent-two']) {
    try {
      const path = `evidence/${name}.json`; const result = publicJson(root, path);
      const declaredScope = String(result.scope ?? '');
      const scope = /(?:local|fixture|mock)/i.test(declaredScope) ? 'local/fixture; does not certify remote requirements' : /(?:remote|production-origin)/i.test(declaredScope)
        ? name.startsWith('pilot-') ? 'remote independent agent browser pilot; not human testing' : name === 'restart-check' ? 'remote restart only; backup restore is separately required' : 'recorded remote operation; review the full result'
        : 'scope not verified';
      supportingEvidence.push({ path, passed: typeof result.passed === 'boolean' ? result.passed : null, canonicalGenesis: result.genesis === genesis, scope });
    } catch { /* Missing supporting results remain uncertified requirements above. */ }
  }
  return {
    at: now.toISOString(), passed, scope: 'offline evidence review', issues, requirements, gates, genesis,
    clock: { startedAt: validClock ? String(start.utc) : null, deadline: validClock ? String(finish.utc) : null, hoursRemaining: validClock ? Math.max(0, (deadline - now.getTime()) / 3_600_000) : null, full24HourSoakFits: validClock && deadline - now.getTime() >= 24 * 3_600_000 },
    releaseStates: { experimental: passed ? 'public experimental TEST devnet accepted' : 'preview/experimental preparation; public release blocked', pumpToken: 'not verified by testnet release checks; separate founder authorization and evidence required', nativeMainnet: 'not verified; separate readiness and release decision required', bridge: 'not verified; two-way redemption and reserve conservation require separate proof' }, unresolvedInputs, supportingEvidence,
  };
}
export function acceptanceMarkdown(report: ReleaseReport): string {
  const rows = report.gates.map(gate => `| ${gate.id} | ${gate.passed ? 'passed' : 'pending / failed'} | ${gate.passedChecks}/${gate.requiredChecks} |`).join('\n');
  const failed = report.requirements.filter(item => !item.passed).map(item => `- ${item.id}: ${item.label} — ${item.reason}`).join('\n');
  const supporting = report.supportingEvidence.map(result => `- ${result.path}: result ${result.passed === null ? 'unspecified' : result.passed ? 'passed' : 'failed'}; canonical genesis ${result.canonicalGenesis ? 'matches' : 'unverified/differs'}; ${result.scope}.`).join('\n');
  return `# Acceptance report\n\nGenerated ${report.at}. Scope: offline review of recorded evidence; this command performs no chain or browser actions.\n\n${report.releaseStates.experimental}. Local tests and a deployed preview do not certify G0–G7. The founder selected two independent agent browser pilots for this first release; these are agent evidence, not human usability testing.\n\nT0: ${report.clock.startedAt ?? 'invalid'}. Fixed H144: ${report.clock.deadline ?? 'invalid'}. A full 24-hour soak ${report.clock.full24HourSoakFits ? 'still fits before' : 'does not fit before'} the deadline. The clock is never reset.\n\n| Gate | Result | Passed requirements |\n| --- | --- | --- |\n${rows}\n\n## Supporting remote results\n\nThese records support review of individual requirements; they never pass an entire gate automatically.\n\n${supporting || 'No supporting remote results recorded.'}\n\n## Blocking inputs\n\n${report.issues.map(issue => `- ${issue}`).join('\n') || 'None.'}\n\n## Unpassed requirements\n\n${failed || 'All required checks passed.'}\n\n## Separate SOC release states and unresolved inputs\n\nPump token: ${report.releaseStates.pumpToken}. Native mainnet: ${report.releaseStates.nativeMainnet}. Bridge: ${report.releaseStates.bridge}. TEST assets have no monetary value or conversion entitlement. Pending real-token creation does not block a fully accepted TEST network.\n\n${report.unresolvedInputs.map(input => `- ${input}`).join('\n') || 'None recorded.'}\n\n## Recording gate evidence\n\nCreate public evidence/acceptance-gates.json with schemaVersion 1, scope remote-experimental, canonical genesis, checklistSha256, and candidate fields apiOrigin, frontendOrigin, frontendDeploymentId, frontendCommit, apiCommit, networkConfigSha256 and dependencyManifestSha256. Under requirements, use the stable IDs above. Each entry needs passed:true, scope (remote/repository/operator), verifiedAt, and proofs:[{path,sha256}]. Each referenced bounded JSON result must itself have passed:true and explicit scope; remote proofs must carry the canonical genesis. G6 proofs must also include the entire frozen candidate object. Fixtures, aggregate test summaries, symlinks and release aggregates are rejected. Review every checklist item individually. G7's release:check item is derived from the other checks to avoid a circular prerequisite.\n`;
}
export function saveReleaseReport(report: ReleaseReport, root = RELEASE_ROOT): void {
  mkdirSync(resolve(root, 'evidence'), { recursive: true }); mkdirSync(resolve(root, 'docs'), { recursive: true });
  writeFileSync(resolve(root, 'evidence/release-check.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(resolve(root, 'docs/acceptance-report.md'), acceptanceMarkdown(report));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = evaluateRelease(); saveReleaseReport(report);
  console.log(JSON.stringify({ passed: report.passed, scope: report.scope, gates: report.gates, issues: report.issues, releaseStates: report.releaseStates, deadline: report.clock.deadline }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
