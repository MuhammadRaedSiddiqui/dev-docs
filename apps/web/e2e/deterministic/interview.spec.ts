import { test, expect } from '../lib/mock-fixtures';
import { WorkspacePage } from '../lib/pages/WorkspacePage';
import { PROJECT_ID, project, type StreamMode } from '../lib/mocks/application';
import { getActiveDomains } from '../../lib/interview/domains';
import type { ProjectType } from '@devdocs/shared';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

for (const type of ['saas', 'api', 'internal_tool', 'mobile', 'landing_page', 'other'] as ProjectType[]) {
  test(`complete ${type}: automatic advancement, canonical persistence, resume and ZIP`, async ({ page, app }, info) => {
    test.setTimeout(120_000);
    app.projects = [{ ...project(type), interviewData: null }];
    const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
    await ui.discover();
    const domains = getActiveDomains(type);
    for (const [index, domain] of domains.entries()) {
      await expect(ui.text(`Interview / ${domain.label}`)).toBeVisible();
      if (domain.mode === 'open') await ui.answer(`The ${domain.id} requirements include team collaboration and project management.`);
      else {
        const before = app.streams.length;
        await ui.radios.first().check();
        expect(app.streams).toHaveLength(before);
        await expect(ui.button('Confirm choice')).toBeEnabled(); await ui.click('Confirm choice');
      }
      await expect.poll(() => app.projects[0].documents.some(d => d.domainId === domain.id)).toBe(true);
      if (index < domains.length - 1) await expect(ui.text(`Interview / ${domains[index + 1].label}`)).toBeVisible();
      await expect(ui.button(/^Continue to/)).toHaveCount(0);
    }
    await expect(ui.heading('Your project plan is ready.')).toBeVisible();
    await expect.poll(() => app.projects[0].status).toBe('complete');
    const streamCount = app.streams.length;
    await ui.reload(); await expect(ui.heading('Your project plan is ready.')).toBeVisible();
    await ui.click('View complete documentation');
    const download = await ui.download('Export .zip');
    const zip = await JSZip.loadAsync(await readFile((await download.path())!));
    expect(Object.keys(zip.files).filter(name => name.endsWith('.md')).sort()).toEqual([...domains.map(d => `docs/${d.file}`), 'docs/README.md'].sort());
    for (const d of domains) expect(await zip.file(`docs/${d.file}`)!.async('string')).toContain(`Generated ${d.id} decisions`);
    expect(app.streams).toHaveLength(streamCount);
  });
}

for (const mode of ['auth', 'rate_limit', 'persistence', 'empty', 'eof', 'malformed', 'network', 'model_unavailable'] as StreamMode[]) {
  test(`${mode}: preserves answer, retries without duplicate turns or unnecessary generation`, async ({ page, app }, info) => {
    app.streamMode = mode;
    const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
    await ui.answer('A collaboration workspace for remote teams');
    await expect(ui.button('Retry')).toBeVisible();
    await expect(ui.field('Your answer')).toHaveValue('A collaboration workspace for remote teams');
    expect(app.projects[0].documents).toHaveLength(0);
    expect(app.projects[0].interviewData.completedDomains).toHaveLength(0);
    app.streamMode = 'success'; await ui.click('Retry');
    await expect(ui.text('Interview / Architecture')).toBeVisible();
    await expect.poll(() => app.projects[0].interviewData.completedDomains).toContain('planning');
    expect(app.streams).toHaveLength(mode === 'persistence' ? 1 : 2);
    expect(app.projects[0].interviewData.conversationHistory.filter((m: any) => m.role === 'user')).toHaveLength(1);
    await expect(ui.text(/Generate the|The user described/)).toHaveCount(0);
  });
}

test('conditional follow-up restores after reload and passes confirmed context', async ({ page, app }, info) => {
  app.followUp = true;
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.answer('A private collaboration workspace');
  await expect(ui.heading('Should team members share records or keep them private?')).toBeVisible();
  expect(app.projects[0].documents).toHaveLength(0);
  await expect.poll(() => app.projects[0].interviewData.workflow?.followUpCount).toBe(1);
  await ui.field('Your answer').fill('Not sure');
  await expect.poll(() => app.projects[0].interviewData.workflow?.draft.text).toBe('Not sure');
  await ui.reload();
  await expect(ui.field('Your answer')).toHaveValue('Not sure');
  await expect(ui.heading('Should team members share records or keep them private?')).toBeVisible();
  await ui.click('Send answer');
  await expect(ui.text('Interview / Architecture')).toBeVisible();
  expect(app.streams).toHaveLength(2);
  expect(app.streams[1].followUpCount).toBe(1);
  expect(app.streams[1].interview.confirmedAnswers.map((a: any) => a.answer)).toEqual(['A private collaboration workspace', 'Not sure']);
  expect(app.streams[1].interview.lockedContext.teamSize).toBe('small');
});

test('Enter, Shift+Enter, IME and duplicate submissions', async ({ page, app }, info) => {
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.click('Send answer'); await expect(ui.alert).toContainText('Enter an answer');
  await ui.field('Your answer').fill('   '); await ui.click('Send answer'); expect(app.streams).toHaveLength(0);
  await ui.field('Your answer').fill('Not sure');
  await ui.field('Your answer').dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  expect(app.streams).toHaveLength(0);
  await ui.field('Your answer').press('Shift+Enter'); await expect(ui.field('Your answer')).toHaveValue('Not sure\n');
  await ui.field('Your answer').press('Enter');
  await expect(ui.text('Interview / Architecture')).toBeVisible(); expect(app.streams).toHaveLength(1);
});

test('radio validation, keyboard selection, Other explanation and confirmation', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)]; const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.click('Confirm choice'); await expect(ui.alert).toContainText('Select an option');
  await ui.radios.first().focus(); await ui.keyboard('ArrowRight');
  await expect(ui.radios.nth(1)).toBeChecked(); expect(app.streams).toHaveLength(0);
  await page.getByRole('radio', { name: /^Other/ }).check(); await ui.click('Confirm choice');
  await expect(ui.alert).toContainText('Describe your choice');
  await ui.field('Describe your choice (required)').fill('Event-driven modular service');
  await ui.button('Confirm choice').evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(ui.text('Interview / Database')).toBeVisible(); expect(app.streams).toHaveLength(1);
  expect(app.streams[0].interview.lockedChoices.architecture.pattern).toBe('custom:Event-driven modular service');
});

test('interrupted save is reconciled without repeating successful generation', async ({ page, app }, info) => {
  app.streamMode = 'saved_eof'; const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.answer('Team collaboration'); await expect(ui.button('Retry')).toBeVisible();
  await ui.click('Retry'); await expect(ui.text('Interview / Architecture')).toBeVisible();
  expect(app.streams).toHaveLength(1);
  await expect.poll(() => app.projects[0].interviewData.workflow?.pending).toBeNull();
  await ui.reload(); await expect(ui.text('Interview / Architecture')).toBeVisible();
});

test('failed generation restores pending answer on reload', async ({ page, app }, info) => {
  app.streamMode = 'persistence'; const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.answer('A collaboration workspace'); await expect(ui.button('Retry')).toBeVisible();
  await expect.poll(() => app.projects[0].interviewData.workflow?.pending.generatedDocument).toContain('Generated planning');
  await ui.reload(); await expect(ui.field('Your answer')).toHaveValue('A collaboration workspace');
  await ui.click('Retry'); await expect(ui.text('Interview / Architecture')).toBeVisible();
  expect(app.streams).toHaveLength(1);
});

test('deferred section waits for persistence and retry keeps one answer', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)]; app.fail('documents.update', 'Save failed', 1);
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await page.getByRole('radio', { name: /^Defer for now/ }).check(); await ui.click('Confirm choice');
  await expect(ui.button('Retry')).toBeVisible();
  expect(app.projects[0].interviewData.completedDomains).toEqual(['planning']);
  await ui.click('Retry'); await expect(ui.text('Interview / Database')).toBeVisible();
  expect(app.projects[0].documents.find(d => d.domainId === 'architecture')?.content).toContain('Deferred');
  expect(app.streams).toHaveLength(0);
  expect(app.projects[0].interviewData.conversationHistory.filter((m: any) => m.role === 'user')).toHaveLength(1);
});

test('documentation is on demand, preserves answer drafts and matches approved refinements', async ({ page, app, isMobile }, info) => {
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await expect(page.getByRole('region', { name: 'Saved documentation' })).toHaveCount(0);
  await ui.field('Your answer').fill('My draft stays here');
  await ui.click('Documentation'); await expect(ui.text(/Your documentation will appear here/)).toBeVisible();
  await expect(ui.button(/^Documentation/)).toHaveAttribute('aria-expanded', 'true');
  await expect(ui.button(/^Documentation/)).toHaveAttribute('aria-controls', 'interview-documentation');
  await expect(ui.button(/^Documentation/).locator('svg')).toHaveCount(1);
  await ui.keyboard('Escape'); await expect(ui.field('Your answer')).toHaveValue('My draft stays here');
  await expect(ui.button('Documentation')).toBeFocused();
  await expect(ui.button(/^Documentation/)).toHaveAccessibleName('Documentation: open panel');
  await expect(ui.text(/Previous conversation|Choose one option|Context:/i)).toHaveCount(0);
  await ui.expectViewportFits();
  await page.screenshot({ path: info.outputPath('question-first-text.png'), fullPage: true });
  await ui.click('Send answer'); await expect(ui.text('Interview / Architecture')).toBeVisible();
  await expect(ui.text('See an example')).toHaveCount(0);
  if (isMobile) await page.getByText(/Your project plan ·/).click();
  const plan = page.getByRole('navigation', { name: 'Project domains' }).filter({ visible: true });
  await expect(plan.getByRole('button', { name: /Planning.*completed/ })).toContainText('✓');
  await expect(plan.getByRole('button', { name: /Architecture.*current/ }).locator('span').first()).toBeEmpty();
  await expect(page.getByRole('group', { name: 'Project context' })).toHaveCount(0);
  const docButton = await ui.button(/^Documentation/).boundingBox();
  expect(page.viewportSize()!.width - docButton!.x - docButton!.width).toBeLessThanOrEqual(25);
  if (isMobile) await page.getByText(/Your project plan ·/).click();
  await ui.expectViewportFits(); await page.screenshot({ path: info.outputPath('question-first-radio.png'), fullPage: true });
  await ui.click(/^Documentation/); await page.screenshot({ path: info.outputPath('question-first-docs.png'), fullPage: true });
  await ui.expectViewportFits();
});

test('manual edits remain canonical, drafts block partial exports across panel toggles', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)]; const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.click(/^Documentation/); await ui.click('Edit section');
  const content = '## Revised plan\n\nBefore rule\n\n---\n\nAfter rule\n\nUnicode: café';
  await ui.field('Planning & Scope documentation').fill(content);
  await expect(ui.button('Export .zip')).toBeDisabled();
  await ui.click('Close documentation'); await ui.click(/^Documentation/);
  await expect(ui.field('Planning & Scope documentation')).toHaveValue(content);
  await expect(ui.button('Export .md')).toBeDisabled();
  app.fail('documents.update', 'Save failed', 1); await ui.click('Save changes');
  await expect(ui.alert).toContainText('Your draft is preserved');
  expect(app.projects[0].documents[0].content).toContain('Saved planning');
  await ui.click('Retry'); await expect(ui.button('Export .zip')).toBeEnabled();
  expect(app.projects[0].documents[0].content).toBe(content);
  const download = await ui.download('Export .zip');
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(await zip.file('docs/PLANNING.md')!.async('string')).toBe(content);
  expect(zip.file('docs/ARCHITECTURE.md')).toBeNull(); expect(app.streams).toHaveLength(0);
  await ui.reload(); await ui.click(/^Documentation/); await ui.click('Edit section');
  await expect(ui.field('Planning & Scope documentation')).toHaveValue(content);
});

test('saved project provider reaches API and completed-domain navigation preserves draft', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)]; const ui = new WorkspacePage(page, info);
  await ui.setPreference('devdocs_active_provider', 'openai');
  await ui.setPreference(`devdocs_active_provider:${PROJECT_ID}`, 'anthropic'); await ui.openProject(PROJECT_ID);
  await ui.radios.first().check(); await ui.field('Supporting context (optional)').fill('Keep it deployable as one unit');
  await ui.click(/^Documentation/); await ui.click('Close documentation');
  await expect(ui.radios.first()).toBeChecked();
  await ui.click('Confirm choice'); await expect(ui.text('Interview / Database')).toBeVisible();
  expect(app.streams[0].provider).toBe('openai');
  await expect(page.getByLabel('Configured model and provider')).toHaveText('GPT-4o · openai');
  await expect(page.getByRole('combobox', { name: 'Project model and provider' })).toHaveCount(0);
  expect(await ui.storedPreferences()).toMatchObject({ devdocs_active_provider: 'openai', [`devdocs_active_provider:${PROJECT_ID}`]: 'anthropic' });
  expect(app.projects[0].documents[0].content).toContain('Saved planning');
});

test('regeneration failure preserves manual edits and retries only the requested section', async ({ page, app }, info) => {
  app.projects = [project('landing_page', 4)]; app.streamMode = 'persistence';
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID); await ui.click(/^Documentation/);
  await page.getByLabel('Saved section', { exact: true }).selectOption('architecture');
  await page.getByText('Replace this section', { exact: true }).click(); await ui.click('Regenerate Architecture');
  await expect(ui.alert.filter({ hasText: 'could not be saved' }).last()).toBeVisible();
  expect(app.projects[0].documents[1].content).toContain('Saved architecture');
  await ui.button('Retry').last().click();
  await expect.poll(() => app.projects[0].documents[1].content).toContain('Generated architecture');
  expect(app.projects[0].documents[0].content).toContain('Saved planning'); expect(app.streams).toHaveLength(1);
});


test('reuses a previously locked domain choice without asking again', async ({ page, app }, info) => {
  app.projects[0].interviewData.lockedChoices = { architecture: { pattern: 'modular' } };
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.answer('A shared team workspace');
  await expect(ui.text('Interview / Database')).toBeVisible();
  expect(app.projects[0].documents.some(d => d.domainId === 'architecture')).toBe(true);
  expect(app.streams[1].interview.lockedChoices.architecture.pattern).toBe('modular');
  expect(app.projects[0].interviewData.conversationHistory.filter((m: any) => m.role === 'user')).toHaveLength(1);
});


test('documentation stays readable at narrow mobile and tablet widths', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)];
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.click(/^Documentation/);
  for (const width of [320, 360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await ui.expectViewportFits();
    await expect(ui.button('Close documentation')).toBeVisible();
    if (width < 768) await expect(page.getByRole('main')).toBeHidden();
    else await expect(page.getByRole('main')).toBeVisible();
    if (width >= 768 && width < 1280) await expect(page.getByRole('complementary', { name: 'Your project plan' })).toBeHidden();
    await page.screenshot({ path: info.outputPath(`documentation-${width}.png`), fullPage: true });
  }
});

test('returning through client navigation restores canonical manual edits', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)];
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.click(/^Documentation/); await ui.click('Edit section');
  await ui.field('Planning & Scope documentation').fill('## Canonical manual revision');
  await ui.click('Save changes'); await expect(ui.text('Changes saved.')).toBeVisible();
  await page.getByRole('link', { name: 'DevDocs AI', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.goBack();
  await page.waitForURL(`**/project/${PROJECT_ID}/interview`);
  await ui.click(/^Documentation/); await ui.click('Edit section');
  await expect(ui.field('Planning & Scope documentation')).toHaveValue('## Canonical manual revision');
});

test('legacy saved confirmation resumes at next question without generation', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)];
  app.projects[0].interviewData.workflow = {
    currentDomain: 'planning', question: { text: 'Old planning question' }, followUpCount: 0,
    draft: { text: 'Already accepted answer', choice: '', context: '' },
    pending: { domainId: 'planning', mode: 'interview', userMessage: 'Already accepted answer' },
  };
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await expect(ui.text('Interview / Architecture')).toBeVisible();
  await expect(ui.button(/^Continue to/)).toHaveCount(0);
  await expect(ui.radios.first()).not.toBeChecked();
  await expect.poll(() => app.projects[0].interviewData.workflow.currentDomain).toBe('architecture');
  expect(app.streams).toHaveLength(0); expect(app.projects[0].documents).toHaveLength(1);
  await ui.reload(); await expect(ui.text('Interview / Architecture')).toBeVisible();
  expect(app.streams).toHaveLength(0);
});

test('read-only Settings model stays unchanged through failure retry advancement and reload', async ({ page, app }, info) => {
  const ui = new WorkspacePage(page, info);
  await ui.setPreference('devdocs_active_provider', 'openai');
  await ui.setPreference(`devdocs_active_provider:${PROJECT_ID}`, 'anthropic');
  app.streamMode = 'persistence'; await ui.openProject(PROJECT_ID);
  const model = page.getByLabel('Configured model and provider');
  await expect(model).toHaveText('GPT-4o · openai');
  expect(await model.evaluate(el => ({ tag: el.tagName, tabIndex: (el as HTMLElement).tabIndex }))).toEqual({ tag: 'SPAN', tabIndex: -1 });
  await expect(page.locator('header select, header [role="combobox"], header [aria-haspopup]')).toHaveCount(0);
  await ui.answer('A team workspace'); await expect(ui.button('Retry')).toBeVisible();
  await expect(ui.text('Interview / Planning & Scope')).toBeVisible();
  await ui.click('Retry'); await expect(ui.text('Interview / Architecture')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Planning & Scope saved. Now in Architecture.');
  await expect(ui.radios.first()).toBeFocused();
  expect(app.streams).toHaveLength(1); expect(app.streams[0].provider).toBe('openai');
  expect(app.calls.filter(c => c.procedure === 'documents.update')).toHaveLength(1);
  await ui.reload(); await expect(model).toHaveText('GPT-4o · openai');
  expect(await ui.storedPreferences()).toMatchObject({ devdocs_active_provider: 'openai', [`devdocs_active_provider:${PROJECT_ID}`]: 'anthropic' });
});

test('automatic advancement preserves documentation editing and does not steal focus', async ({ page, app }, info) => {
  app.projects = [project('saas', 1)];
  let release!: () => void;
  app.streamGate = new Promise<void>(resolve => { release = resolve; });
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await ui.radios.first().check(); await ui.click('Confirm choice');
  await expect.poll(() => app.streams.length).toBe(1);
  await expect(page.getByRole('status')).toHaveText('Preparing your response…');
  await expect(ui.text('Interview / Architecture')).toBeVisible();
  expect(app.projects[0].documents).toHaveLength(1);
  await ui.click(/^Documentation/); await ui.click('Edit section');
  const edit = ui.field('Planning & Scope documentation');
  await edit.fill('## My unfinished manual edit');
  release();
  await expect.poll(() => app.projects[0].interviewData.workflow?.currentDomain).toBe('database');
  await expect(edit).toBeFocused(); await expect(edit).toHaveValue('## My unfinished manual edit');
  await expect(ui.button('Export .zip')).toBeDisabled();
  await ui.click('Close documentation'); await expect(ui.text('Interview / Database')).toBeVisible();
  await expect(ui.button(/^Documentation/)).toBeFocused();
  expect(app.streams).toHaveLength(1);
});

test('default provider display does not write configuration', async ({ page, app }, info) => {
  const ui = new WorkspacePage(page, info); await ui.openProject(PROJECT_ID);
  await expect(page.getByLabel('Configured model and provider')).toHaveText('Claude Sonnet 4.6 · anthropic');
  await ui.answer('Workspace'); await expect(ui.text('Interview / Architecture')).toBeVisible();
  expect(Object.keys(await ui.storedPreferences()).filter(k => k.startsWith('devdocs_active_provider'))).toEqual([]);
  expect(app.streams[0].provider).toBe('anthropic');
});
