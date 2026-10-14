import { Keypair, Transaction } from '@solana/web3.js';
import { ExtensionType, TOKEN_2022_PROGRAM_ID, getMintLen, getAccountLen, TYPE_SIZE, LENGTH_SIZE, createInitializeMetadataPointerInstruction, createInitializeMintInstruction } from '@solana/spl-token';
import { pack, createInitializeInstruction } from '@solana/spl-token-metadata';
import { SystemProgram, type Connection } from '@solana/web3.js';
import { issuanceInstructions, verifyPrograms } from '../../packages/chain/src/index';
import type { AssetDocument } from '../../packages/config/src/index';
export async function creationMessage(connection: Connection, wallet: Keypair, mint: Keypair, document: AssetDocument) {
  if (mint.publicKey.toBase58() !== document.mint) throw new Error('Creation signer and mint disagree.');
  await verifyPrograms(connection);
  const space = getMintLen([ExtensionType.MetadataPointer]);
  const metadata = { updateAuthority: wallet.publicKey, mint: mint.publicKey, name: document.name, symbol: document.symbol, uri: document.uri, additionalMetadata: [] };
  const fullSpace = space + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const accountSpace = getAccountLen([ExtensionType.ImmutableOwner]);
  const [mintRent, accountRent, latest] = await Promise.all([connection.getMinimumBalanceForRentExemption(fullSpace), connection.getMinimumBalanceForRentExemption(accountSpace), connection.getLatestBlockhash('confirmed')]);
  if (!Number.isSafeInteger(mintRent) || !Number.isSafeInteger(accountRent) || mintRent <= 0 || accountRent <= 0 || !Number.isSafeInteger(mintRent + accountRent)) throw new Error('Creation rent estimate is invalid.');
  const transaction = new Transaction({ feePayer: wallet.publicKey, ...latest }).add(
    SystemProgram.createAccount({ fromPubkey: wallet.publicKey, newAccountPubkey: mint.publicKey, space, lamports: mintRent, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeMetadataPointerInstruction(mint.publicKey, null, mint.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint.publicKey, document.kind === 'nft' ? 0 : 6, wallet.publicKey, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: wallet.publicKey, mint: mint.publicKey, mintAuthority: wallet.publicKey, name: document.name, symbol: document.symbol, uri: document.uri }),
    ...issuanceInstructions(wallet.publicKey, document),
  );
  return { message: transaction.compileMessage(), rent: mintRent + accountRent, mintRent, accountRent, mintSpace: fullSpace, accountSpace };
}
