import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.tools/playwright-browsers');
export default defineConfig({ testDir: './tests/e2e', timeout: 300_000, workers: 1, retries: 0, reporter: [['list'], ['html', { open: 'never' }]], use: { headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' } });
