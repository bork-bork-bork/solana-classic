import { PublicKey } from '@solana/web3.js';
import { validateExperimentalGenesis } from '../../packages/chain/src/index';
import { GENESIS } from './display';
export { API, GENESIS, EXPLORER, safeArtwork } from './display';
export function verifyIdentity(network: { expectedGenesisHash?: string | null; hasMonetaryValue?: boolean; denomination?: string }, status: { state?: string; genesisMatches?: boolean }, actual: string) {
  validateExperimentalGenesis(GENESIS, actual);
  if (network.expectedGenesisHash !== GENESIS || network.hasMonetaryValue !== false || network.denomination !== 'TEST' || status.state !== 'online' || status.genesisMatches !== true) throw new Error('Classic devnet identity is unavailable. Actions are paused.');
}
export function parseAmount(value: string): number {
  if (!/^\d{1,7}(?:\.\d{1,9})?$/.test(value)) throw new Error('Enter a positive amount with at most 9 decimals.');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole!) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is outside the supported range.');
  return Number(units);
}
export function validateTransfer(sender: string, recipient: string, amount: number, balance: number, fee: number | null) {
  const destination = new PublicKey(recipient);
  if (!PublicKey.isOnCurve(destination.toBytes()) || recipient === sender) throw new Error('Use a different ordinary wallet address as recipient.');
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(balance) || balance < 0 || fee === null || !Number.isSafeInteger(fee) || fee < 0 || !Number.isSafeInteger(amount + fee) || amount + fee > balance) throw new Error('Balance must cover the amount and network fee.');
  return destination;
}
