import fs from 'node:fs';
import { devices } from '@playwright/test';
import { test, expect } from '../lib/fixtures';
import { readLiveEvidence } from '../lib/live-evidence';
import { getActiveDomains } from '../../lib/interview/domains';
import { flushNetworkMonitor, getFailedRequests } from '../lib/monitoring/networkMonitor';
import { getConsoleErrors } from '../lib/monitoring/consoleMonitor';

for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile emulation' : 'desktop', () => {
    // A describe may override context options, but not worker browser type.
    const { defaultBrowserType: _browserType, ...mobileContext } = devices['Pixel 7'];
    if (mobile) test.use(mobileContext);
    test('live library: search, domain filters, deep links and preview navigation', async ({ page }, info) => {
      test.setTimeout(8 * 60_000);
      test.skip(!process.env.E2E_RUN_RECORD, 'Complete and edit a full live interview first');
      expect(process.env.PLAYWRIGHT).toBe('0');
      const run = JSON.parse(fs.readFileSync(process.env.E2E_RUN_RECORD!, 'utf8'));
      const evidence = readLiveEvidence(run.projectId);
      expect(evidence.project.status).toBe('complete');
      const domains = getActiveDomains('saas');
      await page.goto('/docs', { waitUntil: 'domcontentloaded' });
      const search = page.getByPlaceholder('Search documents...');
      await expect(search).toBeVisible({ timeout: 45_000 });
      await search.fill(run.name);
      await expect(page.getByText('10 documents', { exact: true })).toBeVisible({ timeout: 45_000 });
      await search.fill(`missing-${run.name}`);
      await expect(page.getByText('No documents match your search or filter.')).toBeVisible();
      await search.fill(run.name);
      const docButton = (file: string) => page.getByRole('button').filter({ hasText: file }).filter({ hasText: run.name }).filter({ visible: true }).first();
      for (const domain of domains) {
        await docButton(domain.file).click();
        await expect(page.getByRole('heading', { name: `Live revision ${domain.id}`, exact: true }).filter({ visible: true })).toBeVisible();
        if (mobile) await page.getByRole('button', { name: 'Close', exact: true }).filter({ visible: true }).click();
      }
      if (!mobile) {
        for (const domain of domains) {
          await page.locator('aside').getByRole('button').filter({ hasText: domain.label }).click();
          await expect(page.getByText('1 document', { exact: true })).toBeVisible();
          await expect(docButton(domain.file)).toBeVisible();
        }
      }
      for (const domain of [domains[2], domains[9]]) {
        await page.goto(`/docs?domain=${domain.id}`, { waitUntil: 'domcontentloaded' });
        await page.getByPlaceholder('Search documents...').fill(run.name);
        await expect(page.getByText('1 document', { exact: true })).toBeVisible({ timeout: 45_000 });
        await docButton(domain.file).click();
        await expect(page.getByRole('heading', { name: `Live revision ${domain.id}`, exact: true }).filter({ visible: true })).toBeVisible();
        const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download/ }).filter({ visible: true }).click()]);
        expect(file.suggestedFilename()).toBe(domain.file);
        const output = info.outputPath(`${mobile ? 'mobile' : 'desktop'}-${domain.file}`);
        await file.saveAs(output);
        expect(fs.readFileSync(output, 'utf8')).toBe(evidence.documents.find(d => d.domain_id === domain.id)!.content);
        await page.screenshot({ path: info.outputPath(`library-${domain.id}.png`) });
        if (mobile) await page.getByRole('button', { name: 'Close', exact: true }).filter({ visible: true }).click();
      }
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
      await flushNetworkMonitor(page, info);
      expect(getFailedRequests(page)).toEqual([]);
      expect(getConsoleErrors(page)).toEqual([]);
    });
  });
}
