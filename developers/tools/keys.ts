import { Keypair } from '@solana/web3.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import network from '../network.json';
export const directory = resolve('.data/developers');
export function privateJson(name: string, value: unknown) { mkdirSync(directory, { recursive: true, mode: 0o700 }); const path = resolve(directory, name); if (!path.startsWith(directory + '/'))
    throw new Error('Private developer path is outside .data/developers'); writeFileSync(path, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' }); chmodSync(path, 0o600); return path; }
export function key(name: string): Keypair { const path = resolve(directory, name); if (!path.startsWith(directory + '/'))
    throw new Error('Invalid developer key path'); const data = JSON.parse(readFileSync(path, 'utf8')); if (data.genesis !== network.expectedGenesisHash || !Array.isArray(data.secretKey) || data.secretKey.length !== 64)
    throw new Error('Only generated Classic devnet keys are supported'); return Keypair.fromSecretKey(Uint8Array.from(data.secretKey)); }
export function createKey(name: string) { if (existsSync(resolve(directory, name)))
    return key(name); const value = Keypair.generate(); privateJson(name, { genesis: network.expectedGenesisHash, publicKey: value.publicKey.toBase58(), secretKey: [...value.secretKey] }); return value; }
