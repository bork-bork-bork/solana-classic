import { defineConfig } from '../apps/web/node_modules/vite/dist/node/index.js';
import react from '../apps/web/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  plugins: [react()],
  resolve: { alias: [
    { find: /^react-dom(\/.*)?$/, replacement: local('../apps/web/node_modules/react-dom') + '$1' },
    { find: /^react(\/.*)?$/, replacement: local('../apps/web/node_modules/react') + '$1' },
    { find: 'buffer', replacement: local('../apps/web/node_modules/buffer/index.js') },
  ] },
  build: { outDir: 'dist', sourcemap: false },
  server: { host: '127.0.0.1', port: 5188, strictPort: true, fs: { allow: [local('..')] } },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
});
