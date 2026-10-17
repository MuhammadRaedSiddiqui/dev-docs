import { test, expect } from '../lib/mock-fixtures';
import { WorkspacePage } from '../lib/pages/WorkspacePage';
import { project } from '../lib/mocks/application';
import { readFile } from 'node:fs/promises';

test('settings deep link opens API key recovery and fits screen', async ({ page }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=apikey');
  await expect(ui.button('Update key')).toBeVisible();
  await ui.expectControlInViewport('Update key'); await ui.expectViewportFits();
});

for (const provider of ['Anthropic', 'OpenAI', 'Meta Muse']) {
  test(`connect, reload and remove ${provider} key without browser storage secrets`, async ({ page, app }, info) => {
    app.keys = [];
    const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=apikey');
    await ui.click(new RegExp(`^${provider}$`));
    const placeholder = provider === 'Anthropic' ? 'sk-ant-api03-...' : provider === 'OpenAI' ? 'sk-...' : 'LLM_...';
    const key = provider === 'Meta Muse' ? 'LLM_fake_test_key_not_a_real_secret_1234' : 'sk-ant-fake-test-key-not-a-real-secret-1234';
    await expect(ui.button('Verify & save')).toBeDisabled();
    await ui.fill(placeholder, key); await ui.click('Verify & save');
    await expect(ui.button('Update key')).toBeVisible();
    expect(JSON.stringify(await ui.storedPreferences())).not.toContain(key);
    await ui.reload(); await ui.click(new RegExp(`^${provider}$`));
    await expect(ui.button('Update key')).toBeVisible();
    await ui.click('Remove key');
    await ui.button('Remove key').last().click();
    await expect(ui.button('Verify & save')).toBeVisible();
    expect(app.keys).toHaveLength(0);
  });
}

test('invalid provider key shows verification error and permits retry', async ({ page, app }, info) => {
  app.keys = []; app.fail('keys.upsert', 'Provider rejected the key', 1);
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=apikey');
  await ui.fill('sk-ant-api03-...', 'sk-ant-fake-test-key-1234567890'); await ui.click('Verify & save');
  await expect(ui.text('Provider rejected the key')).toBeVisible();
  await expect(ui.input('sk-ant-api03-...')).toHaveValue('sk-ant-fake-test-key-1234567890');
  expect(app.keys).toHaveLength(0);
  await ui.click('Verify & save'); await expect(ui.button('Update key')).toBeVisible();
});

test('credential tabs preserve active selection and project data', async ({ page, app }, info) => {
  app.keys.push({ provider: 'openai', maskedKey: 'sk-••••5678', createdAt: '2026-01-01T00:00:00Z' });
  const ui = new WorkspacePage(page, info);
  await ui.goto('/settings');
  await page.evaluate(() => localStorage.setItem('devdocs_active_provider', 'openai'));
  const before = JSON.stringify(app.projects);
  await ui.goto('/settings?section=apikey');
  await expect(ui.heading('AI Providers & Keys')).toBeVisible();
  await ui.click(/^Meta Muse$/);
  expect((await ui.storedPreferences()).devdocs_active_provider).toBe('openai');
  await ui.click(/^Anthropic$/);
  expect((await ui.storedPreferences()).devdocs_active_provider).toBe('openai');
  await expect(ui.button(/OpenAI.*Model:/)).toHaveAttribute('aria-pressed', 'true');
  await expect(ui.button(/Meta Muse.*Model:/)).toBeDisabled();
  await expect(ui.text('Add an API key to enable.')).toBeVisible();
  await ui.click(/Anthropic.*Model:/);
  expect((await ui.storedPreferences()).devdocs_active_provider).toBe('anthropic');
  expect(JSON.stringify(app.projects)).toBe(before);
  expect(app.calls.some(call => call.procedure === 'projects.update')).toBe(false);
  await expect(ui.text(/subsequent AI requests for new and existing projects/)).toBeVisible();
  await ui.reload();
  await expect(ui.button(/Anthropic.*Model:/)).toHaveAttribute('aria-pressed', 'true');
  await expect(ui.text(/last verified|Connected/)).toHaveCount(0);
});

test('failed replacement keeps saved key and entered replacement', async ({ page, app }, info) => {
  const original = app.keys[0].maskedKey;
  app.fail('keys.upsert', 'Replacement rejected', 1);
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=apikey');
  await ui.click('Update key');
  await ui.fill('sk-ant-api03-...', 'sk-ant-replacement-test-1234567890');
  await ui.click('Verify & save');
  await expect(ui.alert).toHaveText('Replacement rejected');
  await expect(ui.input('sk-ant-api03-...')).toHaveValue('sk-ant-replacement-test-1234567890');
  expect(app.keys[0].maskedKey).toBe(original);
  await ui.click('Cancel');
  await expect(ui.text(original)).toBeVisible();
});

test('failed key and Bedrock loads do not claim missing configuration', async ({ page, app }, info) => {
  app.fail('keys.list', 'Metadata unavailable');
  await page.route('**/ai/bedrock-status', route => route.fulfill({ status: 503, json: {} }));
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=apikey');
  await expect(ui.text('Key status unavailable').first()).toBeVisible();
  await expect(ui.text('Configuration unavailable')).toBeVisible();
  await expect(ui.button(/Amazon Bedrock/)).toBeDisabled();
  delete app.failures['keys.list'];
  await ui.button('Retry loading').first().click();
  await expect(ui.button('Update key')).toBeVisible();
});

test('account buttons retain the existing identity management flow', async ({ page }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/settings');
  await page.evaluate(() => {
    (window as any).__profileOpened = 0;
    window.addEventListener('e2e:profile-opened', () => (window as any).__profileOpened++);
  });
  await expect(ui.text('tester@example.test')).toBeVisible();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(ui.text('Passwordless sign-in')).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  await ui.click('Manage profile'); await ui.click('Manage security and sessions');
  expect(await page.evaluate(() => (window as any).__profileOpened)).toBe(2);
});

test('billing explains personal and server billing without upgrade controls', async ({ page }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=plan');
  await expect(ui.text('Free workspace access')).toBeVisible();
  await expect(ui.text(/no subscription charge or configured project quota/)).toBeVisible();
  await expect(ui.text(/associated with your API key/)).toBeVisible();
  await expect(ui.text(/Usage is billed to that AWS account/)).toBeVisible();
  await expect(ui.heading('Future plans')).toBeVisible();
  await expect(ui.button(/Upgrade|Subscribe/)).toHaveCount(0);
});

test('export failure keeps retry available', async ({ page, app }, info) => {
  app.fail('account.exportData', 'Export unavailable', 1);
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=privacy');
  await ui.click('Download data (.json)');
  await expect(ui.alert).toHaveText('Export unavailable');
  const file = await ui.download('Download data (.json)');
  expect(file.suggestedFilename()).toMatch(/\.json$/);
  await expect(ui.text(/Download started/)).toBeVisible();
});

for (const operation of ['credentials', 'export', 'deletion'] as const) {
  test(`pending ${operation} prevents duplicate submissions`, async ({ page, app }, info) => {
    const procedure = operation === 'credentials' ? 'keys.upsert' : operation === 'export' ? 'account.exportData' : 'account.deleteData';
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let requests = 0;
    await page.route(`**/trpc/${procedure}*`, async route => { requests++; await gate; await route.fallback(); });
    const ui = new WorkspacePage(page, info);
    await ui.goto(`/settings?section=${operation === 'credentials' ? 'apikey' : 'privacy'}`);
    if (operation === 'credentials') {
      await ui.click('Update key'); await ui.fill('sk-ant-api03-...', 'sk-ant-replacement-test-1234567890');
    } else if (operation === 'deletion') await ui.fill('DELETE', 'DELETE');
    const label = operation === 'credentials' ? 'Verify & save' : operation === 'export' ? 'Download data (.json)' : 'Delete data & continue';
    await ui.button(label).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    const pending = operation === 'credentials' ? 'Verifying & saving…' : operation === 'export' ? 'Preparing export…' : 'Deleting DevDocs data…';
    try {
      await expect(ui.button(pending)).toBeDisabled();
      await ui.button(pending).evaluate((button: HTMLButtonElement) => button.click());
      await expect.poll(() => requests).toBe(1);
    } finally { release(); }
    if (operation === 'credentials') await expect(ui.button('Update key')).toBeVisible();
    else if (operation === 'export') await expect(ui.text(/Download started/)).toBeVisible();
    else await expect(ui.button('Continue to account management')).toBeVisible();
    expect(app.calls.filter(call => call.procedure === procedure)).toHaveLength(1);
  });
}

test('Bedrock availability controls server provider selection', async ({ page, app }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=apikey');
  await expect(ui.button(/Amazon Bedrock/)).toBeDisabled();
  app.bedrock = true; await ui.reload();
  await expect(ui.button(/Amazon Bedrock/)).toBeEnabled();
  await ui.click(/Amazon Bedrock/);
  expect((await ui.storedPreferences()).devdocs_active_provider).toBe('bedrock');
});

test('privacy export downloads structured data and excludes raw keys', async ({ page }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=privacy');
  const file = await ui.download('Download data (.json)');
  expect(file.suggestedFilename()).toMatch(/^devdocs-data-export-.*\.json$/);
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(data.projects).toHaveLength(1); expect(data.apiKeyConnections[0].maskedKey).toContain('••••');
  expect(JSON.stringify(data)).not.toMatch(/keyHash|ciphertext/);
});

test('account deletion requires exact confirmation and reports failure', async ({ page, app }, info) => {
  app.fail('account.deleteData', 'Deletion unavailable');
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=privacy');
  await expect(ui.button('Delete data & continue')).toBeDisabled();
  await ui.fill('DELETE', 'delete'); await expect(ui.button('Delete data & continue')).toBeDisabled();
  await ui.fill('DELETE', 'DELETE'); await ui.click('Delete data & continue');
  await expect(ui.text('Deletion unavailable')).toBeVisible(); expect(app.projects).toHaveLength(1);
});

test('account deletion succeeds against isolated mock account', async ({ page, app }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/settings?section=privacy');
  await page.evaluate(() => {
    (window as any).__profileOpened = 0;
    window.addEventListener('e2e:profile-opened', () => (window as any).__profileOpened++);
  });
  await ui.fill('DELETE', 'DELETE'); await ui.click('Delete data & continue');
  await expect(ui.text(/DevDocs data deleted/)).toBeVisible();
  expect(app.projects).toHaveLength(0); expect(app.keys).toHaveLength(0);
  await expect(ui.text(/Your sign-in identity has not been removed/)).toBeVisible();
  await expect(ui.button('Delete data & continue')).toHaveCount(0);
  await expect(ui.button('Download data (.json)')).toBeDisabled();
  await ui.click('Continue to account management');
  expect(await page.evaluate(() => (window as any).__profileOpened)).toBe(2);
  expect(app.calls.filter(call => call.procedure === 'account.deleteData')).toHaveLength(1);
});

test('documentation library searches, previews and downloads canonical content', async ({ page, app }, info) => {
  app.projects = [project('saas', 3)];
  const ui = new WorkspacePage(page, info); await ui.goto('/docs');
  await ui.fill('Search documents...', 'architecture');
  await expect(ui.text('1 document')).toBeVisible();
  await ui.click(/ARCHITECTURE.md/);
  await expect(ui.text('Saved architecture decisions.').last()).toBeVisible();
  const file = await ui.download(/Download/);
  expect(file.suggestedFilename()).toBe('ARCHITECTURE.md');
  expect(await readFile((await file.path())!, 'utf8')).toContain('Saved architecture decisions.');
  await ui.expectViewportFits();
});

test('document deep link filters the requested domain', async ({ page, app }, info) => {
  app.projects = [project('saas', 3)];
  const ui = new WorkspacePage(page, info); await ui.goto('/docs?domain=architecture');
  await expect(ui.text('1 document')).toBeVisible();
  await expect(ui.button(/ARCHITECTURE.md/)).toBeVisible();
  await expect(ui.button(/PLANNING.md/)).toHaveCount(0);
});

test('document library empty and failed loads are visible', async ({ page, app }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/docs');
  await expect(ui.text('No documents match your search or filter.')).toBeVisible();
  app.fail('documents.list'); await ui.reload();
  await expect(ui.text('Unable to load documentation.')).toBeVisible({ timeout: 20_000 });
});

test('generated Markdown cannot execute scripts or javascript URLs', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)];
  app.projects[0].documents[0].content = '# Safe heading\n\n<script data-xss>window.__xss=1</script>\n<img src=x onerror="window.__xss=1">\n[unsafe](javascript:alert(1))';
  const ui = new WorkspacePage(page, info); await ui.goto('/docs'); await ui.click(/PLANNING.md/);
  await expect(ui.heading('Safe heading')).toBeVisible(); await ui.expectNoExecutableMarkdown();
});

for (const route of ['/', '/dashboard', '/templates', '/settings', '/docs']) {
  test(`UI layout and screenshot: ${route}`, async ({ page }, info) => {
    const ui = new WorkspacePage(page, info); await ui.goto(route);
    await ui.expectViewportFits();
    await info.attach('layout', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
}

for (const section of ['account', 'apikey', 'plan', 'privacy']) {
  test(`settings ${section} layout and readable controls`, async ({ page }, info) => {
    const ui = new WorkspacePage(page, info); await ui.goto(`/settings?section=${section}`);
    const heading = section === 'account' ? 'Account' : section === 'apikey' ? 'AI Providers & Keys' : section === 'plan' ? 'Plan & Billing' : 'Privacy & Data';
    await expect(ui.heading(heading)).toBeVisible();
    for (const label of ['Account', 'AI Providers & Keys', 'Plan & Billing', 'Privacy & Data']) {
      await expect(page.locator('aside').getByRole('button', { name: label, exact: true })).toBeInViewport();
    }
    if (section === 'apikey') await expect(ui.button('Update key')).toBeVisible();
    const content = page.locator('main > div');
    expect((await content.boundingBox())!.width).toBeLessThanOrEqual(720);
    await ui.expectViewportFits();
    const control = page.locator('main button').first();
    if (await control.count()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(info.project.name === 'mobile' ? 44 : 38);
      await control.focus();
      await expect(control).toBeFocused();
    }
    const screenshot = info.outputPath(`settings-${section}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await info.attach(`settings-${section}`, { path: screenshot, contentType: 'image/png' });
    if (section === 'apikey') {
      await ui.button(/Amazon Bedrock/).scrollIntoViewIfNeeded();
      await ui.expectViewportFits();
      const selectionScreenshot = info.outputPath('settings-provider-selection.png');
      await page.screenshot({ path: selectionScreenshot, fullPage: true });
      await info.attach('settings-provider-selection', { path: selectionScreenshot, contentType: 'image/png' });
    }
  });
}
