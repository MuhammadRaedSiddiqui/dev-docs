import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const run = fs.readFileSync(path.resolve('../../.freebuff/auth-testing/current-run.txt'), 'utf8').trim();
const attempt = process.env.AUTH_ATTEMPT ?? 'initial';
export default defineConfig({
  testDir: './e2e/tests', testMatch: /real-auth\.e2e\.spec\.ts/,
  fullyParallel: false, workers: 1, retries: 0, timeout: 20 * 60_000,
  outputDir: path.join(run, attempt, 'test-results'),
  reporter: [['list'], ['html', { outputFolder: path.join(run, attempt, 'playwright-report'), open: 'never' }],
    ['json', { outputFile: path.join(run, attempt, 'results.json') }]],
  use: { ...devices['Desktop Chrome'], channel: process.env.AUTH_BROWSER_CHANNEL || undefined,
    baseURL: 'http://localhost:3000', headless: process.env.AUTH_HEADLESS === '1',
    video: 'on', trace: 'on', screenshot: 'only-on-failure', navigationTimeout: 60_000, actionTimeout: 30_000 },
});
