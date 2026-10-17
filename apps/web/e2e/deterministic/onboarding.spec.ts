import { test, expect } from '../lib/mock-fixtures';
import { WorkspacePage } from '../lib/pages/WorkspacePage';
import { project, PROJECT_ID } from '../lib/mocks/application';

for (const provider of ['Anthropic', 'OpenAI', 'Meta Muse']) {
  test(`new account connects ${provider} before creating its first project`, async ({ page, app }, info) => {
    test.setTimeout(120_000);
    app.projects = []; app.keys = [];
    const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
    await ui.click(/New project/i); await ui.fill('e.g. TaskFlow SaaS', 'First project');
    await ui.click(/SaaS product$/); await ui.click(/^Create project/);
    await ui.click(new RegExp(`^${provider}$`));
    const placeholder = provider === 'Anthropic' ? 'sk-ant-api03-...' : provider === 'OpenAI' ? 'sk-...' : 'LLM_...';
    await expect(ui.input(placeholder)).toHaveAttribute('type', 'password');
    await ui.fill(placeholder, 'short'); await ui.click(/Verify & create project/);
    await expect(ui.text(/look like a valid API key/)).toBeVisible();
    expect(app.projects).toHaveLength(0);
    const key = provider === 'Meta Muse' ? 'LLM_fake_test_key_1234567890123456' : 'sk-ant-fake-test-key-1234567890123456';
    await ui.fill(placeholder, key); await ui.click(/Verify & create project/);
    await ui.waitForDiscovery();
    expect(app.projects).toHaveLength(1); expect(app.keys).toHaveLength(1);
    expect(JSON.stringify(await ui.storedPreferences())).not.toContain(key);
  });
}

test('new account can choose configured Bedrock without storing a key', async ({ page, app }, info) => {
  test.setTimeout(120_000);
  app.projects = []; app.keys = []; app.bedrock = true;
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await ui.click(/New project/i); await ui.fill('e.g. TaskFlow SaaS', 'AWS project');
  await ui.click(/API service$/); await ui.click(/^Create project/); await ui.click(/^Bedrock$/);
  await ui.click(/Create project/); await ui.waitForDiscovery();
  expect(app.keys).toHaveLength(0);
  expect((await ui.storedPreferences()).devdocs_active_provider).toBe('bedrock');
});

test('onboarding key verification failure keeps the draft and can retry', async ({ page, app }, info) => {
  test.setTimeout(120_000);
  app.projects = []; app.keys = []; app.fail('keys.upsert', 'Verification unavailable', 1);
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await ui.click(/New project/i); await ui.fill('e.g. TaskFlow SaaS', 'Retry onboarding');
  await ui.click(/SaaS product$/); await ui.click(/^Create project/);
  await ui.fill('sk-ant-api03-...', 'sk-ant-fake-test-key-1234567890123456'); await ui.click(/Verify & create project/);
  await expect(ui.text('Verification unavailable')).toBeVisible(); expect(app.projects).toHaveLength(0);
  await ui.click(/Verify & create project/); await ui.waitForDiscovery();
  expect(app.projects).toHaveLength(1);
});

test('template snapshot failure retries the same project without a duplicate', async ({ page, app }, info) => {
  test.setTimeout(120_000);
  app.projects = []; app.fail('projects.update', 'Template setup unavailable', 1);
  const ui = new WorkspacePage(page, info); await ui.goto('/templates');
  await ui.click('Start with template'); await ui.fill('e.g. My SaaS App', 'Retry template'); await ui.click(/Start planning/);
  await expect(page.getByRole('dialog', { name: 'Name your project' }).getByRole('alert')).toHaveText('Template setup unavailable');
  await ui.click(/Start planning/); await ui.waitForInterview();
  expect(app.projects).toHaveLength(1);
  expect(app.calls.filter(c => c.procedure === 'projects.create')).toHaveLength(1);
});

test('domain choices support keyboard navigation and activation', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)];
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.radios.first().focus(); await ui.keyboard('ArrowRight');
  await expect(ui.radios.nth(1)).toBeFocused(); expect(app.streams).toHaveLength(0); await ui.click('Confirm choice');
  await expect.poll(() => app.projects[0].interviewData.completedDomains).toContain('architecture');
});

test('project search has a visible control on every viewport', async ({ page }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await ui.click('Search projects and documents'); await ui.fill('Search projects and documents', 'Team');
  await expect(ui.text('Team Planner').last()).toBeVisible(); await ui.keyboard('Escape');
});

test('account menu signs out through the authentication adapter', async ({ page }, info) => {
  test.setTimeout(120_000);
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await ui.click('Account menu'); await ui.click('Sign out');
  await ui.waitForMockSignIn();
});

test('malformed saved messages and duplicate domains are recovered on hydration', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)];
  app.projects[0].interviewData.conversationHistory.push(null, { role: 'assistant', content: 42 });
  app.projects[0].interviewData.completedDomains = ['planning', 'planning', 'invalid'];
  app.projects[0].interviewData.lockedChoices = [];
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await expect(ui.radios.first()).toBeVisible(); await expect.poll(() => app.projects[0].interviewData.completedDomains).toEqual(['planning']);
});

test('unsupported saved provider falls back to Anthropic', async ({ page, app }, info) => {
  const ui = new WorkspacePage(page, info); await ui.setPreference(`devdocs_active_provider:${PROJECT_ID}`, 'retired-provider');
  await ui.openProject(PROJECT_ID); await ui.answer('A team collaboration workspace');
  await expect.poll(() => app.streams.length).toBeGreaterThan(0);
  expect(app.streams[0].provider).toBe('anthropic');
});
