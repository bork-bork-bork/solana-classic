import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { configuredApi, evidence } from '../../scripts/evidence';

test('production-origin TEST wallet, mint, NFT ownership and responsive journey', async ({ browser }) => {
  const web = process.env.SC_WEB_URL;
  if (web !== 'https://solana-classic-soc.vercel.app') throw new Error('Remote acceptance requires the exact configured production web origin.');
  const { api, facts } = await configuredApi();
  if (facts.mode !== 'remote') throw new Error('A local fixture cannot satisfy the production browser journey.');
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const mobile = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await desktop.newPage(); const recipientPage = await mobile.newPage();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const screenshotDir = resolve('evidence/screenshots'); mkdirSync(screenshotDir, { recursive: true });
  try {
    await page.goto(web + '/playground'); await recipientPage.goto(web + '/playground');
    await expect(page.getByText('Network responding', { exact: true })).toBeVisible({ timeout: 30_000 });
    for (const target of [page, recipientPage]) {
      await target.getByRole('button', { name: 'Create test wallet', exact: true }).click();
      await expect(target.locator('.wallet-rail code.address')).toBeVisible();
      expect(await target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    const payer = await page.locator('.wallet-rail code.address').innerText();
    const recipient = await recipientPage.locator('.wallet-rail code.address').innerText();
    await recipientPage.screenshot({ path: resolve(screenshotDir, 'mobile-360.png'), fullPage: true });
    await page.getByRole('button', { name: 'Get 1 TEST', exact: true }).click();
    await expect(page.getByText('1 TEST received', { exact: true })).toBeVisible({ timeout: 45_000 });
    await page.getByRole('tab', { name: 'Meme token', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Browser Meme');
    await page.getByLabel('Symbol', { exact: true }).fill('BROWSE');
    await page.getByRole('button', { name: 'Create meme token', exact: true }).click();
    await expect(page.locator('.completion strong')).toHaveText('Browser Meme is issued and verified.', { timeout: 120_000 });
    const memeMint = await page.locator('.completion code.address').innerText();
    await page.getByLabel('Recipient public address').fill(recipient);
    await page.getByLabel('Amount', { exact: true }).fill('0.01');
    await page.getByRole('button', { name: 'Transfer TEST', exact: true }).click();
    await expect(page.getByText('TEST transferred', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel('Amount', { exact: true }).fill('1');
    await page.getByRole('button', { name: 'Transfer meme tokens', exact: true }).click();
    await expect(page.getByText('Asset transferred', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Start a new creation', exact: true }).click();
    await page.getByRole('tab', { name: 'NFT', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Browser Art');
    await page.getByLabel('Symbol', { exact: true }).fill('BART');
    await page.getByRole('button', { name: 'Mint test NFT', exact: true }).click();
    await expect(page.locator('.completion strong')).toHaveText('Browser Art is issued and verified.', { timeout: 120_000 });
    const nftMint = await page.locator('.completion code.address').innerText();
    await page.getByRole('button', { name: 'Transfer this NFT', exact: true }).click();
    await expect(page.getByText('Asset transferred', { exact: true })).toHaveCount(2, { timeout: 30_000 });
    await expect.poll(async () => {
      const response = await fetch(api + '/api/gallery/' + nftMint);
      const asset = await response.json() as { currentOwner?: string }; return asset.currentOwner;
    }, { timeout: 60_000, intervals: [3_000] }).toBe(recipient);
    const receiptHrefs = await page.locator('.activity a').evaluateAll(anchors => anchors.map(a => a.getAttribute('href')));
    await page.screenshot({ path: resolve(screenshotDir, 'desktop-1440-issued.png'), fullPage: true });
    await page.getByRole('link', { name: 'Gallery', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Browser Art', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Playground', exact: true }).click();
    await expect(page.locator('.wallet-rail code.address')).toHaveText(payer);
    const lookup = await desktop.newPage(); await lookup.goto(web + '/explorer/address/' + nftMint); await lookup.reload();
    await expect(lookup.getByRole('heading', { name: 'Follow the proof.', exact: true })).toBeVisible();
    await expect(lookup.getByText('Account program owner', { exact: true })).toBeVisible({ timeout: 20_000 });
    const pdf = await desktop.request.get(web + '/whitepaper.pdf'); expect(pdf.status()).toBe(200); expect(pdf.headers()['content-type']).toContain('application/pdf'); expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).toEqual({ local: [], session: [] });
    await page.reload(); await expect(page.getByRole('button', { name: 'Create test wallet', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    evidence('browser-remote', { at: new Date().toISOString(), scope: 'isolated Chromium production-origin remote chain journey, not external human pilot or soak', passed: true, web, api, genesis: facts.expectedGenesisHash, payer, recipient, memeMint, nftMint, receiptHrefs, widths: [1440, 360], pageErrors: errors });
  } catch (error) {
    evidence('browser-remote', { at: new Date().toISOString(), scope: 'isolated Chromium production-origin journey', passed: false, web, api, genesis: facts.expectedGenesisHash, error: error instanceof Error ? error.message : 'Browser journey failed.' }); throw error;
  } finally { await desktop.close(); await mobile.close(); }
});
