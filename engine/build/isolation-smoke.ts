import { readFileSync, writeFileSync } from 'node:fs';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { KNOWN_PUBLIC_GENESIS, validateExperimentalGenesis, assertNetwork, prepareIssuance, finishIssuance, transferNative, transferAsset, waitForSignature, currentNftOwner, verifyAsset, type Issuance } from '@solana-classic/chain';
import type { AssetDocument } from '@solana-classic/config';
const connection = new Connection('http://127.0.0.1:18899', { commitment: 'confirmed', confirmTransactionInitialTimeout: 60_000 });
const expected = process.env.SC_ENGINE_EXPECTED_GENESIS;
const canonical = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
if (!expected || expected === canonical || KNOWN_PUBLIC_GENESIS.has(expected)) throw new Error('Only a fresh isolated engine-test genesis is allowed.');
await assertNetwork(connection, expected);
const receiptPath = process.env.SC_ENGINE_RECEIPT;
if (!receiptPath || !/^\/data\/runs\/[a-f0-9-]+\/smoke\.json$/.test(receiptPath)) throw new Error('Invalid isolated receipt path.');
type Receipt = { passed: boolean; genesis: string; recipient: string; recipientBalance: number; assets: AssetDocument[]; signatures: string[]; guardChecks: number };
async function verify(receipt: Receipt) {
  if (!receipt.passed || receipt.genesis !== expected) throw new Error('Receipt genesis does not match isolated chain.');
  await assertNetwork(connection, expected);
  if (await connection.getBalance(new PublicKey(receipt.recipient), 'finalized') !== receipt.recipientBalance) throw new Error('Native balance did not survive.');
  for (const document of receipt.assets) {
    await verifyAsset(connection, document);
    const accounts = await connection.getTokenAccountsByOwner(new PublicKey(receipt.recipient), { mint: new PublicKey(document.mint) }, 'finalized');
    if (accounts.value.length !== 1 || accounts.value[0]!.account.owner.toBase58() !== 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb') throw new Error('Transferred token account is not verified.');
    if ((await connection.getTokenAccountBalance(accounts.value[0]!.pubkey, 'finalized')).value.amount !== '1') throw new Error('Transferred asset balance is not preserved.');
    if (document.kind === 'nft' && await currentNftOwner(connection, document.mint) !== receipt.recipient) throw new Error('NFT ownership is not preserved.');
  }
}
if (process.env.SC_ENGINE_SMOKE_MODE === 'verify') {
  await verify(JSON.parse(readFileSync(receiptPath, 'utf8')) as Receipt);
  console.log('Verified isolated native balance, immutable token metadata and NFT ownership after recovery.');
} else {
  let guardChecks = 0;
  for (const hash of KNOWN_PUBLIC_GENESIS) {
    let rejected = false; try { validateExperimentalGenesis(hash, hash); } catch { rejected = true; }
    if (!rejected) throw new Error('Public-chain guard failed.'); guardChecks++;
  }
  let rejected = false; try { validateExperimentalGenesis(canonical, expected); } catch { rejected = true; }
  if (!rejected) throw new Error('Wrong-genesis guard failed.'); guardChecks++;
  const payer = Keypair.generate(), recipient = Keypair.generate();
  await assertNetwork(connection, expected);
  const funding = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
  await waitForSignature(connection, funding, 'finalized');
  const native = await transferNative(connection, expected, payer, recipient.publicKey.toBase58(), 10_000_000);
  await waitForSignature(connection, native, 'finalized');
  const receipt: Receipt = { passed: true, genesis: expected, recipient: recipient.publicKey.toBase58(), recipientBalance: 10_000_000, assets: [], signatures: [funding, native], guardChecks };
  for (const kind of ['meme', 'nft'] as const) {
    const mint = Keypair.generate();
    const document: AssetDocument = { mint: mint.publicKey.toBase58(), kind, name: 'Isolated engine ' + kind, symbol: kind === 'nft' ? 'ART' : 'MEME', presetId: 0, contentHash: '0'.repeat(64), uri: 'https://example.invalid/isolated-engine/' + mint.publicKey.toBase58(), image: 'https://example.invalid/isolated-engine/art.svg' };
    const state: Issuance = { mint, document, preparationSignature: null, issuanceSignature: null };
    await prepareIssuance(connection, expected, payer, state);
    receipt.signatures.push(await finishIssuance(connection, expected, payer, state));
    const moved = await transferAsset(connection, expected, payer, document, recipient.publicKey.toBase58(), 1n);
    await waitForSignature(connection, moved, 'finalized'); receipt.signatures.push(moved); receipt.assets.push(document);
  }
  await verify(receipt);
  writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
  console.log('Passed isolated native, meme and NFT actions plus four network admission controls; browser/operator wallets were not used.');
}
