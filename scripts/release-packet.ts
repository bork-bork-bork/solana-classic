import { writeFileSync, readdirSync, existsSync, readFileSync, lstatSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRelease, saveReleaseReport, publicBytes, sha256, RELEASE_ROOT, MAX_PUBLIC_BYTES } from './release-check.js';

export function sanitizePublic(value: unknown): unknown {
  if (Array.isArray(value)) {
    if (value.length >= 32 && value.every(byte => Number.isInteger(byte) && Number(byte) >= 0 && Number(byte) <= 255)) return '[REDACTED key material]';
    return value.map(sanitizePublic);
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (/^(?:secret|privatekey|keypair|seedphrase|mnemonic|password|credential|apikey|apitoken|authtoken|accesstoken|refreshtoken|authorization|cookie|env|environment|headers|email|operatorcontact|alertdestination)/.test(normalized)) return [key, '[REDACTED]'];
    return [key, sanitizePublic(entry)];
  }));
  if (typeof value === 'string') {
    if (/-----BEGIN .*PRIVATE KEY-----|\bBearer\s+\S+|(?:secret|password|access_token|api_key)\s*[=:]|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value)) return '[REDACTED sensitive text]';
    if (/^(?:\/Users\/|\/home\/|\/private\/)/.test(value)) return '[REDACTED local path]';
    if (/^https?:\/\//.test(value)) { try { const url = new URL(value); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString(); } catch { return '[REDACTED invalid URL]'; } }
  }
  return value;
}
function sanitizePublicText(text: string): string {
  return text.split('\n').map(line => /-----BEGIN .*PRIVATE KEY-----|\bBearer\s+\S+|(?:secret|password|access_token|api_key)\s*[=:]/i.test(line)
    ? '[REDACTED sensitive line]'
    : line.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[REDACTED email]').replace(/(?:\/Users\/|\/home\/|\/private\/)[^\s`]+/g, '[REDACTED local path]')).join('\n');
}
export function createReleasePacket(root = RELEASE_ROOT, now = new Date()) {
  const report = evaluateRelease(root, now); saveReleaseReport(report, root);
  const finalDestination = resolve(root, 'evidence/release-packet');
  const destination = mkdtempSync(resolve(root, 'evidence/.release-packet-'));
  const inventory: { source: string; output: string; sourceSha256: string; sanitizedSha256: string; bytes: number }[] = [];
  const skipped: string[] = [];
  const sources = [
    'config/network.json', 'config/network.remote.json', 'config/launch.json', 'docs/dependency-manifest.json', 'docs/agave-release.json',
    'docs/agave-compatibility-release.json', 'docs/token-program-release.json', 'docs/resolved-package-versions.json', 'docs/sprint-clock.json', 'docs/planning/launch-inputs.json',
  ];
  if (existsSync(resolve(root, 'evidence'))) for (const file of readdirSync(resolve(root, 'evidence'))) if (/^[a-z0-9][a-z0-9._-]*\.json$/i.test(file) && !/^release-(?:check|packet)\.json$/.test(file) && !/(?:secret|keypair|credential|private.?key)/i.test(file)) sources.push(`evidence/${file}`);
  for (const source of sources.sort()) {
    try {
      const original = publicBytes(root, source);
      const body = Buffer.from(JSON.stringify(sanitizePublic(JSON.parse(original.toString('utf8'))), null, 2) + '\n');
      const output = source.replaceAll('/', '__'); writeFileSync(resolve(destination, output), body);
      inventory.push({ source, output, sourceSha256: sha256(original), sanitizedSha256: sha256(body), bytes: body.length });
    } catch { skipped.push(source); }
  }
  for (const source of ['package.json', 'vercel.json']) {
    try {
      const path = resolve(root, source); const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_PUBLIC_BYTES) throw new Error('Not a bounded public manifest.');
      const original = readFileSync(path); const body = Buffer.from(JSON.stringify(sanitizePublic(JSON.parse(original.toString('utf8'))), null, 2) + '\n');
      writeFileSync(resolve(destination, source), body); inventory.push({ source, output: source, sourceSha256: sha256(original), sanitizedSha256: sha256(body), bytes: body.length });
    } catch { skipped.push(source); }
  }
  for (const source of ['CONTRIBUTING.md', 'docs/CONTRACTS.md', 'docs/COMPATIBILITY.md', 'docs/planning/NATIVE_SOC_DECISION.md', 'docs/planning/ACCEPTANCE_CHECKLIST.md', 'docs/OPERATIONS.md', 'docs/operations-runbook.md']) {
    if (!existsSync(resolve(root, source))) continue;
    try {
      const original = publicBytes(root, source); const body = Buffer.from(sanitizePublicText(original.toString('utf8'))); const output = source.replaceAll('/', '__');
      writeFileSync(resolve(destination, output), body); inventory.push({ source, output, sourceSha256: sha256(original), sanitizedSha256: sha256(body), bytes: body.length });
    } catch { skipped.push(source); }
  }
  writeFileSync(resolve(destination, 'acceptance-report.md'), readFileSync(resolve(root, 'docs/acceptance-report.md')));
  writeFileSync(resolve(destination, 'README.md'), '# Experimental release packet\n\nSanitized public JSON manifests and results only. Source/output digests distinguish original evidence from redacted copies. No .env, .tools, .data, credentials, key files, runtime ledger, private logs or screenshots are collected. This packet records failures as well as passes; creating it is not acceptance. Read acceptance-report.md for each gate and unresolved inputs. Real SOC creation, native mainnet and bridge redemption require separate authorization and evidence.\n');
  const packet = { at: now.toISOString(), passed: report.passed && skipped.length === 0, scope: 'offline sanitized public evidence packet', releaseAccepted: report.passed, destination: 'evidence/release-packet', inventory, skipped, releaseStates: report.releaseStates, unresolvedInputs: report.unresolvedInputs, clock: report.clock };
  writeFileSync(resolve(destination, 'index.json'), JSON.stringify(packet, null, 2) + '\n');
  rmSync(finalDestination, { recursive: true, force: true }); renameSync(destination, finalDestination);
  writeFileSync(resolve(root, 'evidence/release-packet.json'), JSON.stringify(packet, null, 2) + '\n');
  return packet;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packet = createReleasePacket();
  console.log(JSON.stringify({ passed: packet.passed, releaseAccepted: packet.releaseAccepted, destination: packet.destination, files: packet.inventory.length, skipped: packet.skipped, scope: packet.scope }, null, 2));
  if (!packet.passed) process.exitCode = 1;
}
