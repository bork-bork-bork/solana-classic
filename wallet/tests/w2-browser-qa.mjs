// W2 local same-origin adapter fixtures. No request reaches either live service.
import { chromium, expect } from '@playwright/test';
import { Keypair, PublicKey, VersionedTransaction, TransactionInstruction } from '@solana/web3.js';
import { AccountLayout, MintLayout, AccountType, ExtensionType, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, decodeMintToInstruction, decodeSetAuthorityInstruction, AuthorityType } from '@solana/spl-token';
import { pack, createUpdateAuthorityInstruction } from '@solana/spl-token-metadata';
import { writeFile } from 'node:fs/promises';
const target = process.env.CLASSIC_WALLET_QA_URL ?? 'http://127.0.0.1:4188/'; const local = new URL(target).origin;
const API = 'https://network-release-production.up.railway.app'; const IMAGE = 'https://image-assets-production.up.railway.app';
const genesis = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode(bytes) { let number = 0n; for (const byte of bytes) number = number * 256n + BigInt(byte); let out = ''; while (number > 0n) { out = alphabet[Number(number % 58n)] + out; number /= 58n; } for (const byte of bytes) { if (byte) break; out = '1' + out; } return out; }
function tokenAccount(owner, mint, amount) { const data = Buffer.alloc(AccountLayout.span); AccountLayout.encode({ mint, owner, amount, delegateOption: 0, delegate: PublicKey.default, state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, data); return wire(data, TOKEN_2022_PROGRAM_ID); }
function wire(data, owner, executable = false) { return { data: [data.toString('base64'), 'base64'], owner: owner.toBase58(), executable, lamports: 2_000_000, rentEpoch: 0 }; }
function mintAccount(document, corrupt = false) {
  const mint = new PublicKey(document.mint); const metadata = pack({ updateAuthority: PublicKey.default, mint, name: corrupt ? 'Wrong metadata' : document.name, symbol: document.symbol, uri: document.uri, additionalMetadata: [] });
  const data = Buffer.alloc(234 + 4 + metadata.length);
  MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: document.kind === 'nft' ? 1n : 1_000_000_000_000n, decimals: document.kind === 'nft' ? 0 : 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, data);
  data[165] = AccountType.Mint;
  data.writeUInt16LE(ExtensionType.MetadataPointer, 166); data.writeUInt16LE(64, 168); mint.toBuffer().copy(data, 202);
  data.writeUInt16LE(ExtensionType.TokenMetadata, 234); data.writeUInt16LE(metadata.length, 236); Buffer.from(metadata).copy(data, 238);
  return wire(data, TOKEN_2022_PROGRAM_ID);
}
const browser = await chromium.launch({ headless: true });
const evidence = { schemaVersion: 2, scope: 'local-same-origin-adapter-mocked-api-rpc', liveRequests: 0, liveTransactions: false, target, createdAt: new Date().toISOString(), checks: [] };
async function setup(context, options = {}) {
  const foreign = Keypair.generate().publicKey; const foreignMint = Keypair.generate().publicKey; const unknownMint = Keypair.generate().publicKey;
  const publicOnly = { mint: foreignMint.toBase58(), kind: 'nft', name: 'Gallery Is Not Ownership', symbol: 'FOREIGN', presetId: 1, contentHash: 'f'.repeat(64), uri: API + '/assets/' + 'f'.repeat(64) + '/metadata.json', image: API + '/assets/' + 'f'.repeat(64) + '/image.svg', issuanceSignature: '2'.repeat(88), verifiedAt: new Date().toISOString(), currentOwner: foreign.toBase58() };
  const state = { wallet: null, balance: 0, pending: null, created: false, registered: false, broadcasts: 0, feeReads: 0, rentReads: 0, uploadRequests: 0, uploadRegistrations: 0, image: null, corruptOwnMetadata: false, forbiddenRequests: [], wireVerified: false, ownerRequests: [] };
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== local) { state.forbiddenRequests.push(request.url()); return route.abort(); }
    if (url.pathname === '/') { const response = await route.fetch(); const html = (await response.text()).replace('id="root"', 'id="root" data-gateway="/_network"'); return route.fulfill({ response, body: html }); }
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/chain-assets/') || url.pathname.startsWith('/uploaded-assets/')) {
      if (url.pathname.endsWith('metadata.json')) return json({ name: state.pending?.name ?? publicOnly.name, symbol: state.pending?.symbol ?? publicOnly.symbol, image: options.metadataMismatch ? 'https://evil.example/art.png' : state.pending?.image ?? publicOnly.image });
      if (url.pathname.endsWith('.png') && state.image) return route.fulfill({ contentType: 'image/png', body: state.image });
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#cde7d7"/><circle cx="50" cy="50" r="30" fill="#153b2b"/></svg>' });
    }
    if (!url.pathname.startsWith('/_network/')) return route.continue();
    const path = url.pathname.slice('/_network'.length);
    if (path === '/api/network') return json({ expectedGenesisHash: genesis, denomination: 'TEST', hasMonetaryValue: false });
    if (path === '/api/status') return json({ state: 'online', genesisMatches: true, slot: 12345 });
    if (path === '/api/faucet') { state.wallet = new PublicKey(request.postDataJSON().publicKey); state.balance = 1_000_000_000; return json({ state: 'confirmed', signature: '2'.repeat(88), message: 'Confirmed', requestId: request.postDataJSON().requestId }); }
    if (path === '/api/assets' || path === '/api/upload-assets') {
      const input = request.postDataJSON(); const uploaded = path === '/api/upload-assets';
      if (uploaded) { state.uploadRequests++; if (!input.imageData || input.imageData.startsWith('data:')) throw new Error('Upload must pass bounded raw base64'); }
      const { imageData, ...fields } = input; const contentHash = uploaded ? 'b'.repeat(64) : 'a'.repeat(64); const origin = uploaded ? IMAGE : API;
      state.pending = { ...fields, contentHash, uri: origin + '/assets/' + contentHash + '/metadata.json', image: origin + '/assets/' + contentHash + '/image.' + (uploaded ? 'png' : 'svg'), issuanceSignature: '', verifiedAt: new Date().toISOString() };
      return json(state.pending);
    }
    if ((path === '/api/gallery' || path === '/api/upload-gallery') && request.method() === 'POST') { if (!state.created || request.postDataJSON().mint !== state.pending.mint) throw new Error('Gallery registration before creation'); if (path === '/api/upload-gallery') state.uploadRegistrations++; state.registered = true; state.pending.issuanceSignature = request.postDataJSON().issuanceSignature; return json(state.pending); }
    if (path === '/api/gallery') return json({ entries: [publicOnly, ...(state.registered ? [state.pending] : [])], nextCursor: null });
    if (path.startsWith('/api/gallery/')) {
      const mint = path.split('/').at(-1); if (mint === publicOnly.mint) return json(publicOnly);
      if (state.registered && mint === state.pending.mint) return json({ ...state.pending, ...(state.pending.kind === 'nft' ? { currentOwner: state.wallet.toBase58() } : {}) });
      return json({ error: { message: 'Unregistered asset' } }, 404);
    }
    if (path === '/api/rpc') {
      const input = request.postDataJSON(); let result;
      switch (input.method) {
        case 'getGenesisHash': result = genesis; break;
        case 'getBalance': result = { context: { slot: 12345 }, value: state.balance }; break;
        case 'getLatestBlockhash': result = { context: { slot: 12345 }, value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 999999 } }; break;
        case 'getMinimumBalanceForRentExemption': state.rentReads++; result = 1_000_000 + input.params[0] * 1000 + (options.rentRise && state.rentReads >= 7 ? 1_000_000 : 0); break;
        case 'getFeeForMessage': state.feeReads++; result = { context: { slot: 12345 }, value: options.feeRise && state.feeReads >= 3 ? 20000 : 10000 }; break;
        case 'getMultipleAccounts': result = { context: { slot: 12345 }, value: input.params[0].map(() => wire(Buffer.alloc(0), PublicKey.default, true)) }; break;
        case 'getAccountInfo': result = { context: { slot: 12345 }, value: state.created && input.params[0] === state.pending?.mint ? mintAccount(state.pending, state.corruptOwnMetadata) : input.params[0] === publicOnly.mint ? mintAccount(publicOnly) : null }; break;
        case 'getTokenAccountsByOwner': {
          if (input.params[1].programId !== TOKEN_2022_PROGRAM_ID.toBase58()) throw new Error('Inventory used another token program');
          const owner = new PublicKey(input.params[0]); state.ownerRequests.push(owner.toBase58());
          const rows = [
            { pubkey: getAssociatedTokenAddressSync(foreignMint, foreign, false, TOKEN_2022_PROGRAM_ID).toBase58(), account: tokenAccount(foreign, foreignMint, 1n) },
            { pubkey: getAssociatedTokenAddressSync(unknownMint, owner, false, TOKEN_2022_PROGRAM_ID).toBase58(), account: tokenAccount(owner, unknownMint, 1n) },
          ];
          if (state.created) { const mint = new PublicKey(state.pending.mint); rows.push({ pubkey: getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID).toBase58(), account: tokenAccount(owner, mint, state.pending.kind === 'nft' ? 1n : 1_000_000_000_000n) }); }
          result = { context: { slot: 12345 }, value: rows }; break;
        }
        case 'simulateTransaction': result = { context: { slot: 12345 }, value: { err: null, logs: [], unitsConsumed: 150 } }; break;
        case 'sendTransaction': {
          const transaction = VersionedTransaction.deserialize(Buffer.from(input.params[0], 'base64'));
          if (transaction.signatures.length !== 2) throw new Error('Creation must sign with wallet and fresh mint');
          const keys = transaction.message.staticAccountKeys;
          const instructions = transaction.message.compiledInstructions.map(ix => new TransactionInstruction({ programId: keys[ix.programIdIndex], data: Buffer.from(ix.data), keys: ix.accountKeyIndexes.map(index => ({ pubkey: keys[index], isSigner: transaction.message.isAccountSigner(index), isWritable: transaction.message.isAccountWritable(index) })) }));
          const tokenInstructions = instructions.filter(ix => ix.programId.equals(TOKEN_2022_PROGRAM_ID));
          const minted = tokenInstructions.find(ix => ix.data[0] === 7); const revoked = tokenInstructions.find(ix => ix.data[0] === 6);
          const expected = state.pending.kind === 'nft' ? 1n : 1_000_000_000_000n;
          if (!minted || decodeMintToInstruction(minted, TOKEN_2022_PROGRAM_ID).data.amount !== expected || !revoked || decodeSetAuthorityInstruction(revoked, TOKEN_2022_PROGRAM_ID).data.authorityType !== AuthorityType.MintTokens || decodeSetAuthorityInstruction(revoked, TOKEN_2022_PROGRAM_ID).data.newAuthority !== null) throw new Error('Atomic issuance supply/revocation missing');
          const metadataRevoke = createUpdateAuthorityInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: new PublicKey(state.pending.mint), oldAuthority: state.wallet, newAuthority: null });
          if (!tokenInstructions.some(ix => ix.data.equals(metadataRevoke.data))) throw new Error('Metadata authority revocation missing');
          state.wireVerified = true; state.broadcasts++; state.created = true; state.balance -= 5_000_000;
          const signature = encode(transaction.signatures[0]);
          if (options.uncertain) return json({ jsonrpc: '2.0', id: input.id, error: { code: -32000, message: 'Mock uncertain creation response' } });
          result = signature; break;
        }
        case 'getSignatureStatuses': result = { context: { slot: 12345 }, value: [{ slot: 12345, confirmations: null, err: null, confirmationStatus: 'finalized' }] }; break;
        default: throw new Error('Unexpected W2 RPC: ' + input.method);
      }
      return json({ jsonrpc: '2.0', id: input.id, result });
    }
    throw new Error('Unexpected W2 adapter path: ' + path);
  });
  return state;
}
try {
  for (const [name, viewport, kind, upload] of [['desktop-preset-nft', { width: 1280, height: 1040 }, 'nft', false], ['mobile-upload-meme', { width: 390, height: 844 }, 'meme', true], ['desktop-upload-jpg-nft', { width: 1280, height: 1040 }, 'nft', 'jpg']]) {
    const context = await browser.newContext({ viewport }); const state = await setup(context); const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text()); });
    await page.goto(target); await page.getByRole('button', { name: 'Create test session', exact: true }).click(); await page.getByRole('button', { name: 'Get test funds' }).click();
    await expect(page.getByRole('link', { name: 'Roadmap ↗', exact: true })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: 'Roadmap ↗', exact: true })).toHaveAttribute('rel', 'noopener noreferrer');
    const address = await page.locator('.address').textContent();
    await page.getByRole('button', { name: 'Art & memes' }).click(); await expect(page.getByText('Gallery Is Not Ownership')).toBeVisible();
    await page.getByRole('button', { name: 'Owned assets', exact: true }).click(); await expect(page.getByText('No verified owned assets found in the checked accounts.')).toBeVisible();
    await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.getByLabel('Asset type').selectOption(kind);
    await page.getByLabel('Name', { exact: true }).fill('Same Wallet Culture'); await page.getByLabel('Symbol', { exact: true }).fill('CULT');
    if (upload) {
      const images = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16; const context = canvas.getContext('2d'); context.fillStyle = '#00aa66'; context.fillRect(0,0,16,16); return { png: canvas.toDataURL('image/png'), jpg: canvas.toDataURL('image/jpeg') }; });
      state.image = Buffer.from(images.png.split(',')[1], 'base64');
      await expect(page.getByLabel('Upload artwork', { exact: true })).toBeHidden();
      const uploadButton = page.getByRole('button', { name: 'Upload artwork', exact: true });
      await uploadButton.focus(); await expect(uploadButton).toBeFocused();
      const chooserPromise = page.waitForEvent('filechooser'); await uploadButton.press('Enter');
      const chooser = await chooserPromise;
      await chooser.setFiles({ name: upload === 'jpg' ? 'own-art.jpg' : 'own-art.png', mimeType: upload === 'jpg' ? 'image/jpeg' : 'image/png', buffer: Buffer.from((upload === 'jpg' ? images.jpg : images.png).split(',')[1], 'base64') });
      await expect(page.getByAltText('Selected artwork preview')).toBeVisible();
      await page.locator('.artwork-upload').scrollIntoViewIfNeeded(); await page.screenshot({ path: '/tmp/classic-wallet-w2-' + name + '-upload.png', fullPage: false });
    }
    await page.getByRole('button', { name: 'Review creation', exact: true }).click(); await expect(page.getByRole('region', { name: 'Creation review' })).toBeVisible();
    if (state.broadcasts) throw new Error('Creation broadcast before confirmation');
    await page.getByRole('button', { name: 'Confirm test creation' }).click(); await expect(page.getByRole('status')).toContainText('Creation finalized and verified');
    await page.getByRole('button', { name: 'Owned assets', exact: true }).click(); await expect(page.locator('.owned-gallery')).toContainText('Same Wallet Culture');
    await expect(page.locator('.owned-gallery')).toContainText(kind === 'nft' ? '1 CULT' : '1000000 CULT');
    await expect(page.locator('.owned-gallery')).not.toContainText('Gallery Is Not Ownership');
    if (await page.locator('.address').textContent() !== address || state.ownerRequests.some(owner => owner !== address)) throw new Error('Wallet session changed across views');
    if (state.broadcasts !== 1 || !state.wireVerified || (upload && (state.uploadRequests !== 1 || state.uploadRegistrations !== 1))) throw new Error('Incorrect issuance flow');
    state.corruptOwnMetadata = true; await page.getByRole('button', { name: 'Owned assets', exact: true }).click(); await expect(page.getByText('No verified owned assets found in the checked accounts.')).toBeVisible();
    state.corruptOwnMetadata = false; await page.getByRole('button', { name: 'Owned assets', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, document.querySelector('.tabs').getBoundingClientRect().top + scrollY));
    await page.screenshot({ path: '/tmp/classic-wallet-w2-' + name + '.png', fullPage: false });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || localStorage.length || sessionStorage.length)) throw new Error('Overflow or persisted secrets');
    if (state.forbiddenRequests.length || errors.length) throw new Error('Nonlocal request or browser error: ' + [...state.forbiddenRequests, ...errors].join('; '));
    evidence.checks.push({ name, viewport, kind, upload, ...(upload ? { keyboardUploadButton: true, nativeFileInputHidden: true } : {}), roadmapPreservesSession: true, sameSessionAcrossViews: true, galleryNotOwnership: true, tokenAccountOwnerProgramAmountVerified: true, metadataMismatchHidden: true, atomicWireSupplyAndRevocation: true, explicitApproval: true, broadcasts: 1, sameOriginOnly: true, storageEmpty: true, noOverflow: true, screenshot: '/tmp/classic-wallet-w2-' + name + '.png' }); await context.close();
  }
  for (const [name, options, expected] of [['creation-fee-rise', { feeRise: true }, 'fee or rent changed'], ['creation-rent-rise', { rentRise: true }, 'fee or rent changed'], ['creation-metadata-mismatch', { metadataMismatch: true }, 'Stored metadata differs'], ['uncertain-creation-resume', { uncertain: true }, 'Mock uncertain creation response']]) {
    const context = await browser.newContext(); const state = await setup(context, options); const page = await context.newPage(); await page.goto(target);
    await page.getByRole('button', { name: 'Create test session', exact: true }).click(); await page.getByRole('button', { name: 'Get test funds' }).click(); await page.getByRole('button', { name: 'Create', exact: true }).click(); await page.getByRole('button', { name: 'Review creation', exact: true }).click();
    if (!options.metadataMismatch) { await expect(page.getByRole('region', { name: 'Creation review' })).toBeVisible(); await page.getByRole('button', { name: 'Confirm test creation' }).click(); }
    await expect(page.getByRole('alert')).toContainText(expected);
    if (options.uncertain) { await expect(page.getByRole('button', { name: 'Confirm test creation' })).toBeDisabled(); await page.getByRole('button', { name: 'Resume same creation' }).click(); await expect(page.getByRole('status')).toContainText('No second mint was sent'); if (state.broadcasts !== 1) throw new Error('Uncertain creation reminted'); }
    else if (state.broadcasts) throw new Error('Creation guard reached broadcast');
    if (state.forbiddenRequests.length) throw new Error('Nonlocal request'); evidence.checks.push({ name, passed: true, broadcasts: state.broadcasts }); await context.close();
  }
  evidence.passed = true; await writeFile(new URL('../evidence/w2-local-qa.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n'); console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
