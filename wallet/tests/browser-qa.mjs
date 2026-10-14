// Local QA only. All requests to the remote gateway are mocked; no live transactions.
import { chromium, expect } from '@playwright/test';
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import { writeFile } from 'node:fs/promises';
const origin = 'https://network-release-production.up.railway.app';
const genesis = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon';
const target = process.env.CLASSIC_WALLET_QA_URL ?? 'http://127.0.0.1:5188/';
const recipient = Keypair.generate().publicKey.toBase58();
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encode(bytes) { let number = 0n; for (const byte of bytes) number = number * 256n + BigInt(byte); let out = ''; while (number > 0n) { out = alphabet[Number(number % 58n)] + out; number /= 58n; } for (const byte of bytes) { if (byte) break; out = '1' + out; } return out; }
const browser = await chromium.launch({ headless: true });
const evidence = { schemaVersion: 1, scope: 'local-browser-mocked-api-rpc', liveTransactions: false, browser: 'Chromium', browserPlugin: 'not available; regular Playwright', target, createdAt: new Date().toISOString(), checks: [] };
async function mock(context, { wrongGenesis = false, uncertainFaucet = false, feeRise = false, feeRiseAfter = 2, simulationRejected = false, genesisChangesAfterSimulation = false, uncertainSend = false } = {}) {
  const requests = { faucetIds: [], broadcasts: 0, signature: null, balance: 0, feeReads: 0, simulated: false };
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === new URL(target).origin) return route.continue();
    if (url.origin !== origin) return route.abort();
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': new URL(target).origin, 'Access-Control-Allow-Headers': 'content-type,solana-client', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }, body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return json({});
    if (url.pathname === '/api/network') return json({ expectedGenesisHash: genesis, denomination: 'TEST', hasMonetaryValue: false });
    if (url.pathname === '/api/status') return json({ state: 'online', genesisMatches: true, slot: 12345 });
    if (url.pathname === '/api/faucet') {
      const input = request.postDataJSON(); requests.faucetIds.push(input.requestId);
      if (uncertainFaucet) return json({ state: 'uncertain', signature: null, message: 'Mocked interrupted grant', requestId: input.requestId });
      requests.balance = 1_000_000_000;
      return json({ state: 'confirmed', signature: '2'.repeat(88), message: 'Confirmed', requestId: input.requestId });
    }
    if (url.pathname === '/api/gallery') return json({ entries: [{ mint: recipient, name: 'Culture Test', symbol: 'CULT', kind: 'nft', image: origin + '/assets/' + 'a'.repeat(64) + '/image.svg' }], nextCursor: null });
    if (url.pathname.startsWith('/assets/')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#cde7d7"/><circle cx="50" cy="50" r="30" fill="#153b2b"/></svg>' });
    if (url.pathname === '/api/rpc') {
      const input = request.postDataJSON(); let result;
      switch (input.method) {
        case 'getGenesisHash': result = wrongGenesis || (genesisChangesAfterSimulation && requests.simulated) ? '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' : genesis; break;
        case 'getBalance': result = { context: { slot: 12345 }, value: requests.balance }; break;
        case 'getLatestBlockhash': result = { context: { slot: 12345 }, value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 999999 } }; break;
        case 'getFeeForMessage': requests.feeReads++; result = { context: { slot: 12345 }, value: feeRise && requests.feeReads >= feeRiseAfter ? 10000 : 5000 }; break;
        case 'simulateTransaction': requests.simulated = true; result = { context: { slot: 12345 }, value: { err: simulationRejected ? { InstructionError: [0, 'InvalidArgument'] } : null, logs: [], unitsConsumed: 150 } }; break;
        case 'sendTransaction': requests.broadcasts++; requests.signature = encode(VersionedTransaction.deserialize(Buffer.from(input.params[0], 'base64')).signatures[0]); requests.balance -= 10_005_000; if (uncertainSend) return json({ jsonrpc: '2.0', id: input.id, error: { code: -32000, message: 'Mocked uncertain broadcast response' } }); result = requests.signature; break;
        case 'getSignatureStatuses': result = { context: { slot: 12345 }, value: [{ slot: 12345, confirmations: null, err: null, confirmationStatus: 'confirmed' }] }; break;
        default: throw new Error('Unexpected mocked RPC method: ' + input.method);
      }
      return json({ jsonrpc: '2.0', id: input.id, result });
    }
    throw new Error('Unexpected gateway path: ' + url.pathname);
  });
  return requests;
}
try {
  for (const [name, viewport] of [['desktop', { width: 1280, height: 1040 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport }); const requests = await mock(context); const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(target); await expect(page).toHaveTitle('Classic Wallet · Testnet prototype'); await expect(page.getByText('Classic testnet · slot 12345')).toBeVisible();
    await page.getByRole('button', { name: 'Create test session', exact: true }).click(); await expect(page.getByRole('button', { name: 'Get test funds' })).toBeEnabled();
    const firstAddress = await page.locator('.address').textContent();
    await page.getByRole('button', { name: 'Get test funds' }).click(); await expect(page.locator('.balance strong')).toContainText('1');
    await page.getByLabel('Recipient address').fill(recipient); await page.getByLabel('Amount · tSOC').fill('0.01');
    await page.getByRole('button', { name: 'Review transfer', exact: true }).click(); await expect(page.getByRole('region', { name: 'Transfer review' })).toBeVisible();
    if (requests.broadcasts !== 0) throw new Error('Broadcast happened before confirmation');
    await page.screenshot({ path: '/tmp/classic-wallet-' + name + '-review.png', fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/classic-wallet-' + name + '.png', fullPage: false });
    await page.getByRole('button', { name: 'Confirm test transfer' }).click(); await expect(page.getByRole('status')).toHaveText('Transfer confirmed on Classic testnet.');
    if (requests.broadcasts !== 1) throw new Error('Unexpected duplicate broadcast');
    await page.getByRole('button', { name: 'Art & memes' }).click(); await expect(page.getByText('Culture Test')).toBeVisible();
    await page.getByRole('button', { name: 'Activity', exact: true }).click(); await expect(page.getByText('Transfer confirmed', { exact: true })).toBeVisible();
    const hasSecrets = await page.evaluate(() => localStorage.length !== 0 || sessionStorage.length !== 0);
    if (hasSecrets) throw new Error('Browser storage must remain empty');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow');
    await page.reload(); await expect(page.getByRole('button', { name: 'Create test session', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create test session', exact: true }).click();
    if (await page.locator('.address').textContent() === firstAddress) throw new Error('Session survived reload');
    await page.getByRole('button', { name: 'Close test session', exact: true }).click(); await expect(page.getByRole('button', { name: 'Create test session', exact: true })).toBeVisible();
    if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
    evidence.checks.push({ name, viewport, identity: 'passed', meaningfulContent: 'passed', console: 'passed', explicitConfirmation: 'passed', singleBroadcast: 'passed', gallery: 'passed', receipts: 'passed', emptyBrowserStorage: 'passed', sessionLostOnReload: 'passed', closeSession: 'passed', noHorizontalOverflow: 'passed', screenshot: '/tmp/classic-wallet-' + name + '.png' });
    await context.close();
  }
  for (const [name, options] of [['wrong-genesis', { wrongGenesis: true }], ['faucet-uncertain-retry', { uncertainFaucet: true }]]) {
    const context = await browser.newContext(); const requests = await mock(context, options); const page = await context.newPage(); await page.goto(target);
    await page.getByRole('button', { name: 'Create test session', exact: true }).click();
    if (options.wrongGenesis) { await expect(page.getByRole('button', { name: 'Get test funds' })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Review transfer', exact: true })).toBeDisabled(); if (requests.faucetIds.length || requests.broadcasts) throw new Error('Wrong-genesis action leaked'); }
    else { await page.getByRole('button', { name: 'Get test funds' }).click(); await expect(page.getByRole('alert')).toContainText('Mocked interrupted grant'); await page.getByRole('button', { name: 'Get test funds' }).click(); await expect(page.getByRole('alert')).toContainText('Mocked interrupted grant'); if (requests.faucetIds.length !== 2 || requests.faucetIds[0] !== requests.faucetIds[1]) throw new Error('Faucet retry used a new id'); }
    evidence.checks.push({ name, passed: true }); await context.close();
  }
  for (const [name, options, expectedError] of [['changed-fee', { feeRise: true }, 'The fee changed'], ['changed-fee-exact-message', { feeRise: true, feeRiseAfter: 3 }, 'The fee changed'], ['changed-fee-before-broadcast', { feeRise: true, feeRiseAfter: 4 }, 'The fee changed'], ['simulation-rejected', { simulationRejected: true }, 'Simulation rejected'], ['genesis-changes-before-broadcast', { genesisChangesAfterSimulation: true }, 'network identity']]) {
    const context = await browser.newContext(); const requests = await mock(context, options); const page = await context.newPage(); await page.goto(target);
    await page.getByRole('button', { name: 'Create test session', exact: true }).click(); await page.getByRole('button', { name: 'Get test funds' }).click();
    await page.getByLabel('Recipient address').fill(recipient); await page.getByLabel('Amount · tSOC').fill('0.01');
    await page.getByRole('button', { name: 'Review transfer', exact: true }).click(); await expect(page.getByRole('region', { name: 'Transfer review' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm test transfer' }).click(); await expect(page.getByRole('alert')).toContainText(expectedError);
    if (requests.broadcasts) throw new Error(name + ' reached broadcast');
    evidence.checks.push({ name, passed: true, broadcasts: 0 }); await context.close();
  }
  {
    const context = await browser.newContext(); const requests = await mock(context, { uncertainSend: true }); const page = await context.newPage(); await page.goto(target);
    await page.getByRole('button', { name: 'Create test session', exact: true }).click(); await page.getByRole('button', { name: 'Get test funds' }).click();
    await page.getByLabel('Recipient address').fill(recipient); await page.getByLabel('Amount · tSOC').fill('0.01');
    await page.getByRole('button', { name: 'Review transfer', exact: true }).click(); await page.getByRole('button', { name: 'Confirm test transfer' }).click();
    await expect(page.getByRole('alert')).toContainText('Mocked uncertain broadcast response');
    await page.getByRole('button', { name: 'Confirm test transfer' }).click(); await expect(page.getByRole('alert')).toContainText('already submitted');
    if (requests.broadcasts !== 1) throw new Error('Uncertain send was rebroadcast');
    await page.getByRole('button', { name: 'Activity', exact: true }).click(); await page.getByRole('button', { name: 'Check pending transfer' }).click();
    await expect(page.getByText('Transfer confirmed', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Send & receive' }).click(); await expect(page.getByRole('region', { name: 'Transfer review' })).toHaveCount(0);
    evidence.checks.push({ name: 'uncertain-send-reconciliation', passed: true, broadcasts: requests.broadcasts, staleReviewRemoved: true }); await context.close();
  }
  evidence.passed = true;
  await writeFile(new URL('../evidence/local-qa.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally { await browser.close(); }
