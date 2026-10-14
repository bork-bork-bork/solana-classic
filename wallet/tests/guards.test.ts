import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import { API, GENESIS, parseAmount, safeArtwork, validateTransfer, verifyIdentity } from '../src/guards';
const network = { expectedGenesisHash: GENESIS, hasMonetaryValue: false, denomination: 'TEST' };
const status = { state: 'online', genesisMatches: true };
test('only the pinned independent valueless testnet is accepted', () => {
  assert.doesNotThrow(() => verifyIdentity(network, status, GENESIS));
  for (const actual of ['', 'other', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']) assert.throws(() => verifyIdentity(network, status, actual));
});
test('gateway identity, denomination and online state must agree', () => {
  for (const override of [{ expectedGenesisHash: 'other' }, { hasMonetaryValue: true }, { denomination: 'SOC' }]) assert.throws(() => verifyIdentity({ ...network, ...override }, status, GENESIS));
  assert.throws(() => verifyIdentity(network, { ...status, state: 'degraded' }, GENESIS));
  assert.throws(() => verifyIdentity(network, { ...status, genesisMatches: false }, GENESIS));
});
test('decimal amounts convert exactly to integral lamports', () => {
  assert.equal(parseAmount('0.000000001'), 1);
  assert.equal(parseAmount('1.234567891'), 1_234_567_891);
  assert.equal(parseAmount('9000000'), 9_000_000_000_000_000);
});
test('zero, negatives, exponents, overprecision and unsafe amounts are rejected', () => {
  for (const value of ['0', '-1', 'NaN', 'Infinity', '1e3', '1.0000000001', ' 1', '.1', '9999999.999999999', '10000000']) assert.throws(() => parseAmount(value));
});
test('destination must be a different ordinary wallet', () => {
  const sender = Keypair.generate().publicKey.toBase58(); const recipient = Keypair.generate().publicKey.toBase58();
  assert.equal(validateTransfer(sender, recipient, 1, 5_001, 5_000).toBase58(), recipient);
  assert.throws(() => validateTransfer(sender, sender, 1, 5_001, 5_000));
  assert.throws(() => validateTransfer(sender, 'bad', 1, 5_001, 5_000));
  const pda = PublicKey.findProgramAddressSync([Buffer.from('wallet-guard-test')], new PublicKey('11111111111111111111111111111111'))[0];
  assert.throws(() => validateTransfer(sender, pda.toBase58(), 1, 5_001, 5_000));
});
test('fees and balances are checked without fractional or overflow arithmetic', () => {
  const sender = Keypair.generate().publicKey.toBase58(); const recipient = Keypair.generate().publicKey.toBase58();
  for (const [amount, balance, fee] of [[1, 5_000, 5_000], [1, 6_000, null], [0, 6_000, 5_000], [1.1, 6_000, 5_000], [1, -1, 0], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 1]]) assert.throws(() => validateTransfer(sender, recipient, amount!, balance!, fee!));
});
test('artwork cannot inject a third-party tracking URL or script', () => {
  const path = '/assets/' + 'a'.repeat(64) + '/image.svg';
  assert.equal(safeArtwork(API + path), API + path);
  for (const url of ['javascript:alert(1)', 'https://evil.example' + path, API + path + '?tracker=1', API + '/anything.svg', API + path + '#x']) assert.equal(safeArtwork(url), null);
});
