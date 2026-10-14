// Reuse the frozen repository's installed, pinned SDKs. No install/network work.
import { mkdir, readFile, realpath, symlink } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
for (const name of ['@solana/spl-token', '@solana/spl-token-metadata']) {
  const target = await realpath(new URL('../../packages/chain/node_modules/' + name, import.meta.url));
  const found = JSON.parse(await readFile(target + '/package.json', 'utf8'));
  if (found.version !== manifest.dependencies[name]) throw new Error('Pinned dependency mismatch: ' + name);
  const destination = new URL('node_modules/' + name, root);
  await mkdir(new URL('node_modules/@solana/', root), { recursive: true });
  try { await symlink(target, destination, 'dir'); } catch (error) { if (error.code !== 'EEXIST' || await realpath(destination) !== target) throw error; }
}
