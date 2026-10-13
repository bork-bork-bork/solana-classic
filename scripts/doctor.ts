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
const validator = resolve(root, '.tools/agave-v4.3.0/solana-release/bin/solana-test-validator');
let version = 'not installed';
try { version = execFileSync(validator, ['--version'], { encoding: 'utf8' }).trim(); } catch { /* Report the missing pinned binary. */ }
checks.push({ name: 'Verified local Agave fixture binary', passed: version.includes('4.3.0'), detail: version + '; distinct from active remote compatibility runtime' });
try { const { facts, connection } = await configuredApi(); await verifyPrograms(connection); checks.push({ name: 'Experimental network and programs', passed: true, detail: `${facts.mode}: ${facts.expectedGenesisHash}` });
  if (facts.mode === 'remote') {
    const dependencies = JSON.parse(readFileSync(resolve(root, 'docs/dependency-manifest.json'), 'utf8')) as { agave_release: string };
    const actual = await connection.getVersion(); checks.push({ name: 'Actual remote runtime matches manifest', passed: actual['solana-core'] === dependencies.agave_release.replace(/^v/, ''), detail: actual['solana-core'] });
  }
}
catch (error) { checks.push({ name: 'Experimental network and programs', passed: false, detail: error instanceof Error ? error.message : 'Unavailable' }); }
const passed = checks.every(c => c.passed); evidence('doctor', { at: new Date().toISOString(), scope: 'local preflight; remote gates evaluated separately', passed, checks });
console.log(JSON.stringify({ passed, checks }, null, 2)); if (!passed) process.exitCode = 1;
