import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const root = process.cwd();
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const children = [
  spawn(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'), resolve(root, 'apps/api/src/main.ts')], { cwd: root, stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [resolve(root, 'apps/web/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: resolve(root, 'apps/web'), stdio: 'inherit', env: process.env }),
];
const stop = () => { for (const child of children) child.kill('SIGTERM'); };
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
for (const child of children) child.once('exit', code => { if (code && code !== 0) { stop(); process.exitCode = code; } });
