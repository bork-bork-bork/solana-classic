import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import { Connection as SdkConnection } from '@solana/web3.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertNetwork, encodeBase58, validateExperimentalGenesis } from '../../packages/chain/src/index';
import { loadSettings } from '../../apps/api/src/settings';
import { configuredApi } from '../../scripts/evidence';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

type Connection = Parameters<typeof assertNetwork>[0];
const publicGenesisHashes = [
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
];
const chainRequire = createRequire(new URL('../../packages/chain/package.json', import.meta.url));
const sdkRequire = createRequire(chainRequire.resolve('@solana/web3.js'));
const sdkBase58 = sdkRequire('bs58') as { encode(bytes: Uint8Array): string };

describe('experimental network identity (mock RPC only)', () => {
  const privateGenesis = 'isolated-local-genesis';

  it('accepts the explicitly configured matching experimental genesis', () => {
    expect(() => validateExperimentalGenesis(privateGenesis, privateGenesis)).not.toThrow();
  });

  it.each([null, ''])('disables transactions when the expected identity is unset (%s)', expected => {
    expect(() => validateExperimentalGenesis(expected, privateGenesis)).toThrow('Transactions are disabled');
  });

  it('rejects an actual genesis different from the expected experimental identity', () => {
    expect(() => validateExperimentalGenesis(privateGenesis, 'different-local-genesis')).toThrow('Transactions are disabled');
  });

  it.each(publicGenesisHashes)('rejects public Solana genesis %s even when it is configured as expected', publicGenesis => {
    expect(() => validateExperimentalGenesis(publicGenesis, publicGenesis)).toThrow('Transactions are disabled');
    expect(() => validateExperimentalGenesis(privateGenesis, publicGenesis)).toThrow('Transactions are disabled');
    expect(() => validateExperimentalGenesis(publicGenesis, privateGenesis)).toThrow('Transactions are disabled');
  });

  it('checks the current RPC identity on every assertion, rejecting a node changed after a prior match', async () => {
    const getGenesisHash = vi.fn().mockResolvedValueOnce(privateGenesis).mockResolvedValueOnce('replacement-genesis');
    const connection = { getGenesisHash } as unknown as Connection;
    await expect(assertNetwork(connection, privateGenesis)).resolves.toBeUndefined();
    await expect(assertNetwork(connection, privateGenesis)).rejects.toThrow('Transactions are disabled');
    expect(getGenesisHash).toHaveBeenCalledTimes(2);
  });

  it('fails closed when RPC identity cannot be read', async () => {
    const connection = { getGenesisHash: vi.fn().mockRejectedValue(new Error('RPC unavailable')) } as unknown as Connection;
    await expect(assertNetwork(connection, privateGenesis)).rejects.toThrow('RPC unavailable');
  });

  it.each([
    { name: 'leading zero octets', bytes: Uint8Array.from([0, 0, 255, 1, 2]) },
    { name: 'all-zero signature', bytes: new Uint8Array(64) },
    { name: 'high-byte signature', bytes: new Uint8Array(64).fill(255) },
    { name: 'mixed signature', bytes: Uint8Array.from({ length: 64 }, (_, index) => (index * 73) % 256) },
  ])('precomputed public signature encoding matches the Solana SDK encoder for $name', ({ bytes }) => {
    expect(encodeBase58(bytes)).toBe(sdkBase58.encode(bytes));
  });
});

describe('hosting settings (virtual configuration fixture only)', () => {
  const env = {
    SC_NETWORK_CONFIG: '/data/network.json', SC_DATA_DIR: '/data/app', RAILWAY_VOLUME_MOUNT_PATH: '/data',
    ASSET_BASE_URL: 'https://assets.example.test', APP_ORIGIN: 'https://web.example.test',
  };
  beforeEach(() => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      name: 'Fixture', mode: 'remote', expectedGenesisHash: 'private-genesis', denomination: 'TEST', operatorCount: 1, hasMonetaryValue: false,
      tokenProgram: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', associatedTokenProgram: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', resetPolicy: 'Fixture only.',
    }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('defaults to the Linux loopback hosting mode', () => {
    expect(loadSettings(env).hosting).toBe('linux');
  });

  it('enables Railway only with the explicit hosting mode and Railway runtime binding', () => {
    const settings = loadSettings({ ...env, SC_HOSTING: 'railway', RAILWAY_PROJECT_ID: 'fixture-project' });
    expect(settings).toMatchObject({ hosting: 'railway', dataDir: '/data/app', port: 3000, upstreamUrl: 'http://127.0.0.1:8899/' });
  });

  it('rejects Railway hosting outside a Railway runtime', () => {
    expect(() => loadSettings({ ...env, SC_HOSTING: 'railway' })).toThrow('Railway');
  });

  it.each([
    { RAILWAY_VOLUME_MOUNT_PATH: undefined },
    { RAILWAY_VOLUME_MOUNT_PATH: '/other-volume' },
    { SC_DATA_DIR: '/app/.data/app' },
    { SC_NETWORK_CONFIG: '/app/config/network.json' },
  ])('rejects Railway environment overrides that leave canonical persistent paths (%#)', overrides => {
    expect(() => loadSettings({ ...env, SC_HOSTING: 'railway', RAILWAY_PROJECT_ID: 'fixture-project', ...overrides })).toThrow('persistent /data');
  });

  it('rejects a local-mode identity in the Railway remote runtime', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ mode: 'local', operatorCount: 1, hasMonetaryValue: false }));
    expect(() => loadSettings({ ...env, SC_HOSTING: 'railway', RAILWAY_PROJECT_ID: 'fixture-project' })).toThrow('remote genesis');
  });

  it.each(['http://web.example.test', 'http://assets.example.test'])('rejects a non-HTTPS remote origin %s', origin => {
    expect(() => loadSettings({ ...env, SC_HOSTING: 'railway', RAILWAY_PROJECT_ID: 'fixture-project', APP_ORIGIN: origin })).toThrow('HTTPS');
  });

  it.each(['http://rpc.example.test:8899/', 'http://127.0.0.1:8899/proxy', 'http://127.0.0.1:8899/?url=https://rpc.example.test'])('keeps Railway RPC bound to a fixed loopback URL (%s)', upstream => {
    expect(() => loadSettings({ ...env, SC_HOSTING: 'railway', RAILWAY_PROJECT_ID: 'fixture-project', RPC_UPSTREAM: upstream })).toThrow('loopback');
  });
});

describe('test-helper canonical identity (virtual file and mocked RPC only)', () => {
  const canonical = { name: 'Fixture', mode: 'remote', expectedGenesisHash: 'private-fixture-genesis', denomination: 'TEST', operatorCount: 1, hasMonetaryValue: false, tokenProgram: 'fixture', associatedTokenProgram: 'fixture', resetPolicy: 'Fixture only.' };
  beforeEach(() => {
    vi.stubEnv('SC_API_URL', 'https://api.example.test');
    vi.stubEnv('SC_NETWORK_CONFIG', '/private/tmp/virtual-canonical-network.json');
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(canonical));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  function upstreamFacts(facts: typeof canonical, actual = facts.expectedGenesisHash) {
    // The SDK captures its default fetch at import time, so mock its read method directly.
    vi.spyOn(SdkConnection.prototype, 'getGenesisHash').mockResolvedValue(actual);
    const upstream = vi.fn<typeof fetch>(async () => Response.json(facts));
    vi.stubGlobal('fetch', upstream);
    return upstream;
  }

  it('refuses API-reported identity when no independently recorded genesis is configured', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ ...canonical, expectedGenesisHash: null }));
    const upstream = upstreamFacts(canonical);
    await expect(configuredApi()).rejects.toThrow('independently recorded canonical genesis');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects an API genesis that differs from the independent canonical fixture', async () => {
    const upstream = upstreamFacts({ ...canonical, expectedGenesisHash: 'another-genesis' });
    await expect(configuredApi()).rejects.toThrow('independently recorded experimental network');
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('rejects a public Solana genesis even if both configuration and API claim it', async () => {
    const publicFacts = { ...canonical, expectedGenesisHash: publicGenesisHashes[0]! };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(publicFacts));
    const upstream = upstreamFacts(publicFacts);
    await expect(configuredApi()).rejects.toThrow('Transactions are disabled');
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(SdkConnection.prototype.getGenesisHash).toHaveBeenCalledTimes(1);
  });

  it('accepts only matching canonical, API and live-RPC fixture identities', async () => {
    const upstream = upstreamFacts(canonical);
    const configured = await configuredApi();
    expect(configured.facts).toEqual(canonical);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(SdkConnection.prototype.getGenesisHash).toHaveBeenCalledTimes(1);
    expect(configured.connection.rpcEndpoint).toBe('https://api.example.test/api/rpc');
  });

  it('rejects an RPC identity change even when API facts still match the independent configuration', async () => {
    upstreamFacts(canonical, 'replacement-fixture-genesis');
    await expect(configuredApi()).rejects.toThrow('Transactions are disabled');
    expect(SdkConnection.prototype.getGenesisHash).toHaveBeenCalledTimes(1);
  });
});
