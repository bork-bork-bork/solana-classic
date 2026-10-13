import { z } from 'zod';

export const BRAND = { name: 'Solana Classic', ticker: 'SOC', tagline: 'Open to everyone. Built for memes and NFTs.' } as const;
export const TEST_LAMPORTS = 1_000_000_000;
export const MEME_SUPPLY = 1_000_000_000_000n;
export const LIMITS = {
  rpcBodyBytes: 32_768, rpcResponseBytes: 2_097_152, rpcTimeoutMs: 10_000,
  rpcConcurrency: 32, globalRps: 100, readsPerIpMinute: 1_200, submissionsPerIpMinute: 60,
  faucetWalletDay: 3, faucetIpDay: 10, faucetGlobalDay: 1_000,
  assetBodyBytes: 4_096, assetFileBytes: 24_576, assetsIpHour: 150,
  assetsGlobalDay: 1_000, assetStorageBytes: 536_870_912, databaseBytes: 268_435_456,
  confirmedTimeoutMs: 15_000, finalizedTimeoutMs: 60_000,
} as const;
export const RPC_METHODS = [
  'getGenesisHash', 'getHealth', 'getVersion', 'getLatestBlockhash', 'getBlockHeight', 'getBalance',
  'getAccountInfo', 'getMultipleAccounts', 'getTokenAccountsByOwner', 'getTokenLargestAccounts',
  'getTokenSupply', 'getTokenAccountBalance', 'getMinimumBalanceForRentExemption',
  'getSignatureStatuses', 'getTransaction', 'getFeeForMessage', 'simulateTransaction',
  'sendTransaction', 'getSlot', 'getBlockTime',
] as const;
export const addressSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Enter a valid public address.');
export const signatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/, 'Invalid transaction signature.');
export const assetInputSchema = z.object({
  mint: addressSchema, kind: z.enum(['meme', 'nft']),
  name: z.string().trim().min(1).refine(s => [...s].length <= 24, 'Name is limited to 24 characters.'),
  symbol: z.string().regex(/^[A-Za-z0-9]{1,10}$/, 'Use 1–10 letters or numbers.'),
  presetId: z.number().int().min(0).max(3),
}).strict();
export const faucetInputSchema = z.object({ publicKey: addressSchema, requestId: z.string().uuid() }).strict();
export const galleryInputSchema = z.object({ mint: addressSchema, issuanceSignature: signatureSchema, contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const rpcInputSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string().max(100), z.number().finite(), z.null()]), method: z.enum(RPC_METHODS), params: z.array(z.unknown()).max(4).optional() }).strict();
export type AssetInput = z.infer<typeof assetInputSchema>;
export type AssetDocument = AssetInput & { contentHash: string; uri: string; image: string };
export type ActionPhase = 'idle' | 'preparing' | 'simulating' | 'submitted' | 'confirmed' | 'finalizing' | 'complete' | 'incomplete' | 'failed';
export type ActionProgress = { phase: ActionPhase; message: string; signature?: string; mint?: string };
export type NetworkFacts = {
  name: string; mode: 'local' | 'remote'; expectedGenesisHash: string | null;
  denomination: 'TEST'; operatorCount: 1; hasMonetaryValue: false;
  tokenProgram: string; associatedTokenProgram: string; resetPolicy: string;
};
export type NetworkStatus = { state: 'online' | 'degraded' | 'unconfigured'; slot: number | null; genesisMatches: boolean; lastProgressAt: string | null; message: string };
export type FaucetReceipt = { requestId: string; state: 'pending' | 'submitted' | 'confirmed' | 'uncertain' | 'failed'; signature: string | null; lamports: number; message: string };
export type GalleryEntry = AssetDocument & { issuanceSignature: string; verifiedAt: string; currentOwner?: string | null; ownershipState?: 'held' | 'burned' | 'unavailable' };
export const PRESETS = [
  { id: 0, name: 'Circle Face', color: '#6842ed' },
  { id: 1, name: 'Stepped Geometry', color: '#1c9b68' },
  { id: 2, name: 'Grid Face', color: '#ff5b26' },
  { id: 3, name: 'Orbit', color: '#343bf1' },
] as const;

export function presetSvg(id: number): string {
  const p = PRESETS[id];
  if (!p) throw new Error('Unknown preset.');
  const start = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#f7f5ee"/>';
  const geometry = [
    `<circle cx="128" cy="128" r="110" fill="${p.color}"/><circle cx="90" cy="115" r="13" fill="#f7f5ee"/><circle cx="166" cy="115" r="13" fill="#f7f5ee"/><path d="M88 170h80" stroke="#f7f5ee" stroke-width="10"/>`,
    `<path d="M20 230v-48h48v-48h48V86h48V38h48v192Z" fill="${p.color}"/>`,
    `<path d="M22 22h212v212H22Z" fill="${p.color}"/><path d="M93 22v212m70-212v212M22 93h212M22 163h212" stroke="#f7f5ee" stroke-width="4"/><circle cx="72" cy="128" r="13" fill="#20211e"/><circle cx="184" cy="128" r="13" fill="#20211e"/><path d="M102 196h52" stroke="#20211e" stroke-width="9"/>`,
    `<circle cx="128" cy="128" r="102" fill="none" stroke="${p.color}" stroke-width="6"/><circle cx="128" cy="128" r="46" fill="${p.color}"/><circle cx="202" cy="55" r="20" fill="${p.color}"/>`,
  ][id];
  return start + geometry + '</svg>';
}
