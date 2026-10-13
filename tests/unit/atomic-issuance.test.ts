import { createRequire } from 'node:module';
import { Connection, Keypair, PublicKey, SystemInstruction, TransactionMessage, VersionedTransaction, type TransactionInstruction } from '@solana/web3.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareIssuance, finishIssuance, encodeBase58, type Issuance } from '../../packages/chain/src/index';
import { MEME_SUPPLY, type ActionProgress } from '../../packages/config/src/index';

// Real SDK serialization with mocked RPC only; no wallet input or chain effects.
const chainRequire = createRequire(new URL('../../packages/chain/package.json', import.meta.url));
const token = chainRequire('@solana/spl-token') as {
  TOKEN_2022_PROGRAM_ID: PublicKey;
  decodeMintToInstruction(ix: TransactionInstruction, program: PublicKey): { data: { amount: bigint }; keys: { mint: { pubkey: PublicKey } } };
  decodeSetAuthorityInstruction(ix: TransactionInstruction, program: PublicKey): { data: { authorityType: number; newAuthority: PublicKey | null } };
  AuthorityType: { MintTokens: number };
  MintLayout: { span: number; encode(value: Record<string, unknown>, bytes: Buffer): number };
};
const genesis = 'synthetic-private-atomic-genesis';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture(kind: 'nft' | 'meme' = 'nft') {
  const wallet = Keypair.generate(); const mint = Keypair.generate();
  const state: Issuance = { mint, document: { mint: mint.publicKey.toBase58(), kind, name: 'X'.repeat(48), symbol: 'ABCDEFGHIJ', presetId: 0, contentHash: 'a'.repeat(64), uri: 'https://network-release-production.up.railway.app/assets/' + 'a'.repeat(64) + '/metadata.json', image: 'https://network-release-production.up.railway.app/assets/' + 'a'.repeat(64) + '/image.svg' }, preparationSignature: null, issuanceSignature: null };
  const methods = {
    getGenesisHash: vi.fn().mockResolvedValue(genesis),
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: PublicKey.default.toBase58(), lastValidBlockHeight: 100 }),
    getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(2_000_000),
    getMultipleAccountsInfo: vi.fn().mockResolvedValue([{ executable: true }, { executable: true }]),
    simulateTransaction: vi.fn().mockResolvedValue({ value: { err: null, logs: [] } }),
    sendRawTransaction: vi.fn(async (bytes: Uint8Array) => encodeBase58(VersionedTransaction.deserialize(bytes).signatures[0]!)),
    getSignatureStatuses: vi.fn().mockResolvedValue({ value: [{ err: null, confirmationStatus: 'confirmed' }] }),
    getAccountInfo: vi.fn(),
  };
  return { wallet, state, methods, connection: methods as unknown as Connection };
}
describe('atomic issuance safety (real builders, mocked RPC only)', () => {
  it.each(['nft','meme'] as const)('creates %s supply and revokes authorities atomically with one retained receipt', async kind => {
    const { wallet, state, methods, connection } = fixture(kind); const progress: ActionProgress[] = [];
    await prepareIssuance(connection, genesis, wallet, state, update => progress.push(update));
    expect(methods.sendRawTransaction).toHaveBeenCalledTimes(1);
    const bytes = methods.sendRawTransaction.mock.calls[0]![0]; const transaction = VersionedTransaction.deserialize(bytes);
    expect(bytes.byteLength).toBeLessThanOrEqual(1_232); expect(transaction.signatures).toHaveLength(2);
    const instructions = TransactionMessage.decompile(transaction.message).instructions;
    expect(instructions).toHaveLength(8);
    const create = SystemInstruction.decodeCreateAccount(instructions[0]!);
    expect(create.newAccountPubkey.equals(state.mint.publicKey)).toBe(true); expect(create.fromPubkey.equals(wallet.publicKey)).toBe(true); expect(create.programId.equals(token.TOKEN_2022_PROGRAM_ID)).toBe(true);
    const supply = token.decodeMintToInstruction(instructions[5]!, token.TOKEN_2022_PROGRAM_ID);
    expect(supply.keys.mint.pubkey.equals(state.mint.publicKey)).toBe(true); expect(supply.data.amount).toBe(kind === 'nft' ? 1n : MEME_SUPPLY);
    const authority = token.decodeSetAuthorityInstruction(instructions[6]!, token.TOKEN_2022_PROGRAM_ID);
    expect(authority.data).toMatchObject({ authorityType: token.AuthorityType.MintTokens, newAuthority: null });
    expect(instructions[7]!.programId.equals(token.TOKEN_2022_PROGRAM_ID)).toBe(true);
    // Metadata's optional pubkey encodes no update authority as 32 zero bytes.
    expect(instructions[7]!.data.subarray(-32).equals(Buffer.alloc(32))).toBe(true);
    const expected = encodeBase58(transaction.signatures[0]!);
    expect(state.preparationSignature).toBe(expected); expect(state.issuanceSignature).toBe(expected);
    expect(new Set(progress.flatMap(update => update.signature ? [update.signature] : []))).toEqual(new Set([expected]));
    expect(progress.filter(update => update.phase === 'confirmed')).toHaveLength(1);
  });
  it('retains the mint and anticipated receipt across confirmation timeout and resumes waiting without reminting', async () => {
    vi.useFakeTimers(); const { wallet, state, methods, connection } = fixture(); const originalMint = state.mint;
    methods.getSignatureStatuses.mockResolvedValue({ value: [null] });
    const creation = prepareIssuance(connection, genesis, wallet, state);
    const timedOut = expect(creation).rejects.toThrow('still awaiting confirmed');
    await vi.advanceTimersByTimeAsync(15_000); await timedOut;
    expect(state.mint).toBe(originalMint); expect(state.preparationSignature).toBeTruthy(); expect(state.issuanceSignature).toBe(state.preparationSignature);
    const bytes = Buffer.alloc(token.MintLayout.span);
    token.MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 1n, decimals: 0, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, bytes);
    methods.getAccountInfo.mockResolvedValue({ owner: token.TOKEN_2022_PROGRAM_ID, data: bytes });
    methods.getSignatureStatuses.mockRejectedValue(new Error('Synthetic finalization observation unavailable'));
    await expect(finishIssuance(connection, genesis, wallet, state)).rejects.toThrow('Synthetic finalization observation unavailable');
    expect(methods.sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(methods.getAccountInfo.mock.calls.at(-1)?.[0].equals(originalMint.publicKey)).toBe(true);
    expect(methods.getSignatureStatuses.mock.calls.at(-1)?.[0]).toEqual([state.preparationSignature]);
    expect(state.mint).toBe(originalMint); expect(state.issuanceSignature).toBe(state.preparationSignature);
  });
  it.each(['different-private-genesis','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'])('does not simulate or broadcast on initially wrong/public genesis %s', async actual => {
    const { wallet, state, methods, connection } = fixture(); methods.getGenesisHash.mockResolvedValue(actual);
    await expect(prepareIssuance(connection, genesis, wallet, state)).rejects.toThrow('Transactions are disabled');
    expect(methods.simulateTransaction).not.toHaveBeenCalled(); expect(methods.sendRawTransaction).not.toHaveBeenCalled();
    expect(state.preparationSignature).toBeNull(); expect(state.issuanceSignature).toBeNull();
  });
  it.each(['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'])('refuses issuance even when the full public hash %s matches the expected configuration', async actual => {
    const { wallet, state, methods, connection } = fixture(); methods.getGenesisHash.mockResolvedValue(actual);
    await expect(prepareIssuance(connection, actual, wallet, state)).rejects.toThrow('Transactions are disabled');
    expect(methods.simulateTransaction).not.toHaveBeenCalled(); expect(methods.sendRawTransaction).not.toHaveBeenCalled();
    expect(state.preparationSignature).toBeNull(); expect(state.issuanceSignature).toBeNull();
  });
  it('checks genesis after simulation completes and refuses broadcast if identity changes during simulation', async () => {
    const { wallet, state, methods, connection } = fixture(); let actual = genesis; const order: string[] = [];
    methods.getGenesisHash.mockImplementation(async () => { order.push('genesis'); return actual; });
    methods.simulateTransaction.mockImplementation(async () => {
      order.push('simulation started'); await Promise.resolve(); actual = 'replacement-genesis'; order.push('simulation completed'); return { value: { err: null, logs: [] } };
    });
    await expect(prepareIssuance(connection, genesis, wallet, state)).rejects.toThrow('Transactions are disabled');
    expect(order.slice(-2)).toEqual(['simulation completed','genesis']); expect(methods.sendRawTransaction).not.toHaveBeenCalled();
    expect(state.preparationSignature).toBeNull(); expect(state.issuanceSignature).toBeNull();
  });
});
