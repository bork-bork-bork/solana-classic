import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, type TransactionInstruction, type Signer } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, ExtensionType, getMintLen, TYPE_SIZE, LENGTH_SIZE, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, createMintToInstruction, createSetAuthorityInstruction, AuthorityType, getMint, getTokenMetadata, getMetadataPointerState, getAccount, createTransferCheckedInstruction } from '@solana/spl-token';
import { pack, createInitializeInstruction, createUpdateAuthorityInstruction } from '@solana/spl-token-metadata';
import { MEME_SUPPLY, LIMITS, type AssetDocument, type ActionProgress } from '@solana-classic/config';

export const KNOWN_PUBLIC_GENESIS = new Set(['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1', '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']);
export function validateExperimentalGenesis(expected: string | null, actual: string): void {
  if (!expected || KNOWN_PUBLIC_GENESIS.has(actual) || KNOWN_PUBLIC_GENESIS.has(expected) || actual !== expected) throw new Error('Experimental network identity is not verified. Transactions are disabled.');
}
export async function assertNetwork(connection: Connection, expected: string | null) { validateExperimentalGenesis(expected, await connection.getGenesisHash()); }
export async function verifyPrograms(connection: Connection) {
  const accounts = await connection.getMultipleAccountsInfo([TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID], 'confirmed');
  if (accounts.some(a => !a?.executable)) throw new Error('Required Token-2022/associated-token programs are unavailable.');
}
type Report = (progress: ActionProgress) => void;
export function encodeBase58(bytes: Uint8Array): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = 0n; for (const byte of bytes) number = number * 256n + BigInt(byte);
  let encoded = ''; while (number > 0n) { encoded = alphabet[Number(number % 58n)] + encoded; number /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; encoded = '1' + encoded; }
  return encoded;
}
export async function waitForSignature(connection: Connection, signature: string, target: 'confirmed' | 'finalized', timeoutMs = target === 'confirmed' ? LIMITS.confirmedTimeoutMs : LIMITS.finalizedTimeoutMs): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (state?.err) throw new Error('Transaction failed on chain: ' + JSON.stringify(state.err));
    if (state && (state.confirmationStatus === 'finalized' || (target === 'confirmed' && state.confirmationStatus === 'confirmed'))) return;
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error(`Transaction ${signature} is still awaiting ${target}. Check its receipt before retrying.`);
}
export async function submitInstructions(connection: Connection, expected: string, payer: Keypair, instructions: TransactionInstruction[], extraSigners: Signer[] = [], report?: Report): Promise<string> {
  await assertNetwork(connection, expected);
  const latest = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({ feePayer: payer.publicKey, ...latest }).add(...instructions);
  const signed = new VersionedTransaction(transaction.compileMessage());
  signed.sign([payer, ...extraSigners]);
  const serialized = signed.serialize();
  if (serialized.byteLength > 1_232) throw new Error('Transaction exceeds the supported size. Shorten the metadata; nothing was submitted.');
  report?.({ phase: 'simulating', message: 'Checking transaction before submission.' });
  const simulation = await connection.simulateTransaction(signed, { sigVerify: true, commitment: 'confirmed' });
  if (simulation.value.err) throw new Error('Simulation rejected the transaction: ' + JSON.stringify(simulation.value.err), { cause: { simulationLogs: simulation.value.logs } });
  await assertNetwork(connection, expected);
  const anticipatedSignature = encodeBase58(signed.signatures[0]!);
  report?.({ phase: 'preparing', signature: anticipatedSignature, message: 'Signed transaction prepared. Submitting to the verified network.' });
  const signature = await connection.sendRawTransaction(serialized, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 2 });
  if (signature !== anticipatedSignature) throw new Error('Network returned a different transaction signature. Check the signed receipt before retrying.');
  report?.({ phase: 'submitted', signature, message: 'Submitted. Waiting for confirmation.' });
  await waitForSignature(connection, signature, 'confirmed');
  report?.({ phase: 'confirmed', signature, message: 'Confirmed. Final ownership verification is separate.' });
  return signature;
}

export type Issuance = { mint: Keypair; document: AssetDocument; preparationSignature: string | null; issuanceSignature: string | null };
export async function prepareIssuance(connection: Connection, expected: string, wallet: Keypair, state: Issuance, report?: Report): Promise<Issuance> {
  const { mint, document } = state;
  if (mint.publicKey.toBase58() !== document.mint) throw new Error('Mint/metadata mismatch.');
  await assertNetwork(connection, expected); await verifyPrograms(connection);
  const space = getMintLen([ExtensionType.MetadataPointer]);
  const metadata = { updateAuthority: wallet.publicKey, mint: mint.publicKey, name: document.name, symbol: document.symbol, uri: document.uri, additionalMetadata: [] };
  const fullSpace = space + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const rent = await connection.getMinimumBalanceForRentExemption(fullSpace);
  const instructions = [
    SystemProgram.createAccount({ fromPubkey: wallet.publicKey, newAccountPubkey: mint.publicKey, space, lamports: rent, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeMetadataPointerInstruction(mint.publicKey, null, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, document.kind === 'nft' ? 0 : 6, wallet.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: wallet.publicKey, mint: mint.publicKey, mintAuthority: wallet.publicKey, name: document.name, symbol: document.symbol, uri: document.uri }),
  ];
  // The caller owns this state before broadcasting; a timeout never discards the mint signer.
  const signature = await submitInstructions(connection, expected, wallet, instructions, [mint], progress => { if (progress.signature) state.preparationSignature = progress.signature; report?.(progress); });
  state.preparationSignature = signature;
  return state;
}
export function issuanceInstructions(wallet: PublicKey, document: AssetDocument): TransactionInstruction[] {
  const mint = new PublicKey(document.mint);
  const ata = getAssociatedTokenAddressSync(mint, wallet, false, TOKEN_2022_PROGRAM_ID);
  return [
    createAssociatedTokenAccountIdempotentInstruction(wallet, ata, wallet, mint, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint, ata, wallet, document.kind === 'nft' ? 1n : MEME_SUPPLY, [], TOKEN_2022_PROGRAM_ID),
    createSetAuthorityInstruction(mint, wallet, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID),
    createUpdateAuthorityInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, oldAuthority: wallet, newAuthority: null }),
  ];
}
export async function finishIssuance(connection: Connection, expected: string, wallet: Keypair, state: Issuance, report?: Report): Promise<string> {
  await assertNetwork(connection, expected);
  const existing = await getMint(connection, state.mint.publicKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
  if (existing.mintAuthority === null) {
    if (!state.issuanceSignature) throw new Error('Issuance is already immutable. Find the existing receipt; do not mint again.');
    await waitForSignature(connection, state.issuanceSignature, 'finalized');
    await verifyAsset(connection, state.document);
    report?.({ phase: 'complete', signature: state.issuanceSignature, mint: state.document.mint, message: 'Existing issuance finalised and verified.' });
    return state.issuanceSignature;
  }
  if (!existing.mintAuthority.equals(wallet.publicKey) || existing.supply !== 0n) throw new Error('Mint cannot be resumed from this wallet/state.');
  const signature = await submitInstructions(connection, expected, wallet, issuanceInstructions(wallet.publicKey, state.document), [], progress => { if (progress.signature) state.issuanceSignature = progress.signature; report?.(progress); });
  state.issuanceSignature = signature;
  report?.({ phase: 'finalizing', signature, mint: state.document.mint, message: 'Waiting for finalised supply and authority verification.' });
  await waitForSignature(connection, signature, 'finalized');
  await verifyAsset(connection, state.document);
  report?.({ phase: 'complete', signature, mint: state.document.mint, message: 'Issued and verified on the experimental network.' });
  return signature;
}
export async function verifyAsset(connection: Connection, document: AssetDocument) {
  const address = new PublicKey(document.mint);
  const [mint, metadata] = await Promise.all([getMint(connection, address, 'finalized', TOKEN_2022_PROGRAM_ID), getTokenMetadata(connection, address, 'finalized', TOKEN_2022_PROGRAM_ID)]);
  const pointer = getMetadataPointerState(mint);
  const expectedSupply = document.kind === 'nft' ? 1n : MEME_SUPPLY;
  if (mint.supply !== expectedSupply || mint.decimals !== (document.kind === 'nft' ? 0 : 6) || mint.mintAuthority !== null || mint.freezeAuthority !== null || !pointer?.metadataAddress?.equals(address) || pointer.authority !== null || !metadata || (metadata.updateAuthority && !metadata.updateAuthority.equals(PublicKey.default)) || !metadata.mint.equals(address) || metadata.name !== document.name || metadata.symbol !== document.symbol || metadata.uri !== document.uri) throw new Error('Asset supply, metadata or immutable authorities failed verification.');
  return { mint, metadata };
}
export async function currentNftOwner(connection: Connection, mintAddress: string) {
  const mint = new PublicKey(mintAddress);
  const state = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID);
  if (state.supply === 0n) return null;
  if (state.supply !== 1n || state.decimals !== 0) throw new Error('NFT supply is invalid.');
  const candidates = await connection.getTokenLargestAccounts(mint, 'confirmed');
  const holder = candidates.value.find(a => a.amount === '1');
  if (!holder) throw new Error('Current token holder is unavailable.');
  const account = await getAccount(connection, holder.address, 'confirmed', TOKEN_2022_PROGRAM_ID);
  if (!account.mint.equals(mint) || account.amount !== 1n) throw new Error('NFT token account does not match.');
  return account.owner.toBase58();
}
export async function transferNative(connection: Connection, expected: string, wallet: Keypair, recipient: string, amount: number, report?: Report) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid transfer amount.');
  const latest = await connection.getLatestBlockhash('confirmed');
  const instruction = SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: new PublicKey(recipient), lamports: amount });
  const fee = await connection.getFeeForMessage(new Transaction({ feePayer: wallet.publicKey, ...latest }).add(instruction).compileMessage(), 'confirmed');
  if (fee.value === null || (await connection.getBalance(wallet.publicKey, 'confirmed')) < amount + fee.value) throw new Error('Not enough TEST for the transfer and network fee.');
  return submitInstructions(connection, expected, wallet, [instruction], [], report);
}
export async function transferAsset(connection: Connection, expected: string, wallet: Keypair, document: AssetDocument, recipient: string, units: bigint, report?: Report) {
  if (units <= 0n || (document.kind === 'nft' && units !== 1n)) throw new Error('Invalid asset amount.');
  const mint = new PublicKey(document.mint); const destination = new PublicKey(recipient);
  const sourceAta = getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID);
  const destinationAta = getAssociatedTokenAddressSync(mint, destination, false, TOKEN_2022_PROGRAM_ID);
  return submitInstructions(connection, expected, wallet, [createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, destinationAta, destination, mint, TOKEN_2022_PROGRAM_ID), createTransferCheckedInstruction(sourceAta, mint, destinationAta, wallet.publicKey, units, document.kind === 'nft' ? 0 : 6, [], TOKEN_2022_PROGRAM_ID)], [], report);
}
