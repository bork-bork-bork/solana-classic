import { Keypair } from '@solana/web3.js';
import { prepareIssuance, finishIssuance, verifyAsset, waitForSignature, type Issuance } from '@solana-classic/chain';
import { connectDevnet } from '../client';
const kind = process.argv[2] ?? 'nft';
if (kind !== 'nft' && kind !== 'meme')
    throw new Error('Use nft or meme. This starter has no mainnet mode.');
const { network, connection, faucet, createAsset, registerAsset } = await connectDevnet();
const payer = Keypair.generate(), mint = Keypair.generate();
// Disposable generated keys stay in memory. No wallet import, key export, or retry remint.
const grant = await faucet(payer.publicKey.toBase58(), crypto.randomUUID());
if (!grant.signature)
    throw new Error('Funding has no receipt yet. Stop; do not request another grant blindly.');
console.log(JSON.stringify({ action: 'test_funding', signature: grant.signature }));
await waitForSignature(connection, grant.signature, 'finalized');
const document = await createAsset({ mint: mint.publicKey.toBase58(), kind, name: 'Classic Builder ' + kind, symbol: kind === 'nft' ? 'BUILDART' : 'BUILDMEME', presetId: 0 });
const state: Issuance = { mint, document, preparationSignature: null, issuanceSignature: null };
await prepareIssuance(connection, network.expectedGenesisHash, payer, state, progress => { if (progress.signature)
    console.log(JSON.stringify(progress)); });
const signature = await finishIssuance(connection, network.expectedGenesisHash, payer, state);
await waitForSignature(connection, signature, 'finalized');
await verifyAsset(connection, document);
await registerAsset({ mint: document.mint, contentHash: document.contentHash, issuanceSignature: signature });
console.log(JSON.stringify({ passed: true, kind, mint: document.mint, signature, explorer: network.explorer + '/address/' + document.mint, hasMonetaryValue: false, keysRetained: false }, null, 2));
