import { resolve } from 'node:path';
export default { resolve: { alias: { buffer: resolve(import.meta.dirname, '../../apps/web/node_modules/buffer/index.js') } }, build: { outDir: resolve(import.meta.dirname, '../../.tools/developer-app'), emptyOutDir: true } };
