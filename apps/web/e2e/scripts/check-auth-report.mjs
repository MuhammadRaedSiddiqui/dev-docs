// Static report QA only; never contacts Clerk, API, database or providers.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const root = path.resolve('../..');
const run = fs.readFileSync(path.join(root, '.freebuff/auth-testing/current-run.txt'), 'utf8').trim();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root, 'docs/TESTING_REPORT.html')).href);
  const auth = page.locator('#auth-live');
  await auth.scrollIntoViewIfNeeded();
  assert.equal(await auth.locator(':scope > .table-wrap tbody tr').count(), 14);
  assert.equal(await auth.locator(':scope > .table-wrap .badge.pass').count(), 8);
  assert.equal(await auth.locator(':scope > .table-wrap .badge.skip').count(), 6);
  assert.ok(await auth.innerText().then(t => t.includes('No product defect was confirmed')));
  const details = auth.locator('details').last(); await details.locator('summary').click();
  const evidence = JSON.parse(await details.locator('pre').innerText());
  assert.equal(evidence.renewal.sameSession, true);
  assert.equal(evidence.renewal.expiredTokenStatus, 401);
  assert.equal(evidence.recovery.oldSessionStatus, 'removed');
  assert.ok(Object.values(evidence.database.preexistingUnchanged).every(Boolean));
  assert.equal(evidence.spending.paidProviderRequests, 0);
  await details.locator('summary').click();
  await page.screenshot({ path: path.join(run, 'auth-report-desktop.png') });
  await page.locator('#file-search').fill('AuthenticationPage.ts');
  assert.equal(await page.locator('.file-card:visible').count(), 1);
  await page.locator('#file-search').fill('');
  await page.setViewportSize({ width: 412, height: 915 });
  await auth.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(run, 'auth-report-mobile.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  assert.deepEqual(errors, []);
  const result = { authScenarioRows: 14, passed: 8, blocked: 6, evidenceVerified: true,
    sourceSearch: true, mobileOverflow: false, pageErrors: errors };
  fs.writeFileSync(path.join(run, 'auth-report-check.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
