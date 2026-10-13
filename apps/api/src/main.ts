import { createApp } from './app.js';
const { app, settings } = await createApp();
await app.listen({ port: settings.port, host: settings.hosting === 'railway' ? '0.0.0.0' : '127.0.0.1' });
console.log(`Solana Classic API listening on port ${settings.port}; ${settings.hosting ?? 'linux'} gateway; ${settings.network.mode} network.`);
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
