import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const startedAt = new Date().toISOString();
const bootId = randomUUID();
export function runtimeIdentity(genesis: string | null) {
  const root = resolve(import.meta.dirname, '../../..');
  const file = resolve(root, 'config/runtime-build.json');
  if (!existsSync(file)) return { configured: false, genesis, apiBootId: bootId, apiStartedAt: startedAt };
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { sourceCommit: string; coreSha256: string; files: Record<string, string> };
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit) || !/^[a-f0-9]{64}$/.test(manifest.coreSha256)) throw new Error('Invalid runtime source manifest.');
  for (const [path, digest] of Object.entries(manifest.files)) {
    if (!/^(?:apps\/(?:api|web)\/(?:src\/[A-Za-z0-9_.-]+|package\.json|vite\.config\.ts)|packages\/(?:chain|config)\/(?:src\/[A-Za-z0-9_.-]+|package\.json)|scripts\/(?:railway-start\.ts|railway-ops\.ts|install-agave\.py|install-token-program\.py)|(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|config\/(?:network\.remote\.json|network\.json)|infra\/RailwayCompatibility\.Dockerfile))$/.test(path)) throw new Error('Unexpected runtime manifest path.');
    const actual = createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
    if (actual !== digest) throw new Error('Runtime core source checksum mismatch: ' + path);
  }
  if (createHash('sha256').update(JSON.stringify(manifest.files)).digest('hex') !== manifest.coreSha256) throw new Error('Runtime core manifest digest mismatch.');
  return { configured: true, genesis, sourceCommit: manifest.sourceCommit, coreSha256: manifest.coreSha256, apiBootId: bootId, apiStartedAt: startedAt, validatorBootId: process.env.SC_VALIDATOR_BOOT_ID ?? null, validatorStartedAt: process.env.SC_VALIDATOR_STARTED_AT ?? null, deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null, agaveVersion: '3.0.14', tokenProgramVersion: '10.0.0', tokenProgramSha256: 'a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68' };
}
