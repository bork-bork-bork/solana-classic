import { Connection } from '@solana/web3.js';
import { assertNetwork, verifyPrograms } from '@solana-classic/chain';
import { assetInputSchema, faucetInputSchema, galleryInputSchema, type AssetDocument, type FaucetReceipt, type NetworkFacts } from '@solana-classic/config';
import network from './network.json';

// Node-side preview client. Browser origins need operator admission; never spoof Origin.
export async function connectDevnet() {
  const response = await fetch(network.apiBase + '/api/network', { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Devnet configuration is unavailable.');
  const facts = await response.json() as NetworkFacts;
  if (facts.expectedGenesisHash !== network.expectedGenesisHash || facts.hasMonetaryValue !== false || facts.mode !== 'remote' || facts.tokenProgram !== network.tokenProgram || facts.associatedTokenProgram !== network.associatedTokenProgram) throw new Error('Devnet identity or programs changed. Stop and check the published configuration.');
  const connection = new Connection(network.rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });
  await assertNetwork(connection, network.expectedGenesisHash);
  await verifyPrograms(connection);
  async function post<T>(path: '/api/faucet' | '/api/assets' | '/api/gallery', input: unknown): Promise<T> {
    const schema = path === '/api/faucet' ? faucetInputSchema : path === '/api/assets' ? assetInputSchema : galleryInputSchema;
    const body = schema.parse(input);
    await assertNetwork(connection, network.expectedGenesisHash);
    const result = await fetch(network.apiBase + path, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!result.ok) throw new Error(`Devnet request failed (${result.status}). Check the existing receipt before retrying.`);
    return result.json() as Promise<T>;
  }
  return { network, facts, connection,
    faucet: (publicKey: string, requestId: string) => post<FaucetReceipt>('/api/faucet', { publicKey, requestId }),
    createAsset: (input: unknown) => post<AssetDocument>('/api/assets', input),
    registerAsset: (input: unknown) => post('/api/gallery', input),
  };
}
