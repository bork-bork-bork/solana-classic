import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { root, evidence, configuredApi } from './evidence.js';
import { verifyPrograms } from '@solana-classic/chain';
const checks: { name: string; passed: boolean; detail: string }[] = [];
checks.push({ name: 'Node 24', passed: process.versions.node.startsWith('24.'), detail: process.versions.node });
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { packageManager: string };
checks.push({ name: 'pnpm 10 pin', passed: manifest.packageManager.startsWith('pnpm@10.'), detail: manifest.packageManager });
checks.push({ name: 'Frozen lockfile', passed: existsSync(resolve(root, 'pnpm-lock.yaml')), detail: 'pnpm-lock.yaml' });
let scope = 'local preflight; remote gates evaluated separately';
let genesis: string | null = null;
try { const { api, facts, connection } = await configuredApi(); genesis = facts.expectedGenesisHash; await verifyPrograms(connection); checks.push({ name: 'Experimental network and programs', passed: true, detail: `${facts.mode}: ${facts.expectedGenesisHash}` });
  if (facts.mode === 'remote') {
    scope = 'remote actual experimental identity, executable programs and runtime-version preflight; not stability acceptance';
    const dependencies = JSON.parse(readFileSync(resolve(root, 'docs/dependency-manifest.json'), 'utf8')) as { agave_release: string };
    // getVersion is intentionally outside the bounded RPC allowlist. The
    // dedicated attested runtime endpoint exposes the installed version.
    const response = await fetch(api + '/api/runtime', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Runtime attestation unavailable.');
    const actual = await response.json() as { configured: boolean; genesis: string; agaveVersion: string; tokenProgramVersion: string; tokenProgramSha256: string };
    const token = JSON.parse(readFileSync(resolve(root, 'docs/token-program-release.json'), 'utf8')) as { assets: { name: string; digest: string }[]; tag_name: string };
    checks.push({ name: 'Actual remote runtime matches manifest', passed: actual.configured === true && actual.genesis === genesis && actual.agaveVersion === dependencies.agave_release.replace(/^v/, ''), detail: actual.agaveVersion });
    const expectedTokenSha256 = token.assets.find(asset => asset.name === 'spl_token_2022-10.0.0.so')?.digest.replace(/^sha256:/, '');
    checks.push({ name: 'Attested official Token-2022', passed: actual.tokenProgramVersion === token.tag_name.replace(/^program@v/, '') && actual.tokenProgramSha256 === expectedTokenSha256, detail: actual.tokenProgramVersion + ': ' + actual.tokenProgramSha256 });
  } else {
    const validator = resolve(root, '.tools/agave-v4.3.0/solana-release/bin/solana-test-validator');
    let version = 'not installed';
    try { version = execFileSync(validator, ['--version'], { encoding: 'utf8' }).trim(); } catch { /* Report the missing local fixture binary. */ }
    checks.push({ name: 'Verified local Agave fixture binary', passed: version.includes('4.3.0'), detail: version + '; distinct from active remote compatibility runtime' });
  }
}
catch (error) { checks.push({ name: 'Experimental network and programs', passed: false, detail: error instanceof Error ? error.message : 'Unavailable' }); }
const passed = checks.every(c => c.passed); evidence('doctor', { at: new Date().toISOString(), scope, genesis, passed, checks });
console.log(JSON.stringify({ passed, checks }, null, 2)); if (!passed) process.exitCode = 1;
