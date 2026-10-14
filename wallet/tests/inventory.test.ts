import test from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, PublicKey } from '@solana/web3.js';
import { AccountLayout, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { ownedCandidates } from '../src/inventory';
function row(owner: PublicKey, mint: PublicKey, amount: bigint, program = TOKEN_2022_PROGRAM_ID, state = 1) {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({ mint, owner, amount, delegateOption: 0, delegate: PublicKey.default, state, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, data);
  return { pubkey: Keypair.generate().publicKey, account: { data, owner: program, lamports: 1_000_000, executable: false, rentEpoch: 0 } };
}
test('inventory uses account program, wallet ownership and positive balance, not public gallery membership', () => {
  const owner = Keypair.generate().publicKey; const foreign = Keypair.generate().publicKey; const mint = Keypair.generate().publicKey;
  const result = ownedCandidates(owner, [row(owner, mint, 2n), row(owner, mint, 3n), row(foreign, mint, 100n), row(owner, mint, 0n), row(owner, mint, 10n, PublicKey.default), row(owner, mint, 10n, TOKEN_2022_PROGRAM_ID, 2)]);
  assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0]!.units, 5n); assert.equal(result.candidates[0]!.tokenAccounts.length, 2); assert.equal(result.rejected, 3);
});
test('inventory checking is bounded and explicitly reports incompleteness', () => {
  const owner = Keypair.generate().publicKey;
  const rows = Array.from({ length: 60 }, () => row(owner, Keypair.generate().publicKey, 1n));
  const result = ownedCandidates(owner, rows);
  assert.equal(result.scannedAccounts, 50); assert.equal(result.totalAccounts, 60); assert.equal(result.candidates.length, 20); assert.equal(result.truncated, true);
});
