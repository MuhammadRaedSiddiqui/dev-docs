import { test, expect } from '../lib/mock-fixtures';
import { WorkspacePage } from '../lib/pages/WorkspacePage';
import { TEMPLATES } from '../../lib/templates';
import { CARD_CHOICES } from '../../lib/interview/choices';
import type { DomainId } from '../../lib/types';
import { TEAM_SIZE_LABELS, TIMELINE_LABELS, FUNDING_LABELS, EXPERIENCE_LABELS } from '@devdocs/shared';

test('template comparison fits three, two and one columns with aligned actions', async ({ page }, info) => {
  test.setTimeout(120_000);
  const ui = new WorkspacePage(page, info); await ui.goto('/templates');
  await expect(page.getByRole('heading', { name: 'Templates', exact: true })).toBeVisible();
  await expect(page.getByText('Choose a starting point, then customize your project.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to projects' })).toHaveAttribute('href', '/dashboard');
  await expect(page.getByText('About templates')).toHaveCount(0);
  for (const [width, columns] of [[1440, 3], [900, 2], [390, 1], [320, 1]]) {
    await page.setViewportSize({ width, height: 960 });
    await ui.expectViewportFits();
    const cards = await page.getByRole('article').evaluateAll(nodes => nodes.map(node => {
      const card = node.getBoundingClientRect();
      const action = node.querySelector('button')!.getBoundingClientRect();
      return { top: card.top, height: card.height, actionTop: action.top, overflow: node.scrollWidth > node.clientWidth };
    }));
    expect(cards.filter(card => card.top === cards[0].top)).toHaveLength(columns);
    for (let index = 0; index < cards.length; index += columns) {
      const row = cards.slice(index, index + columns);
      expect(new Set(row.map(card => card.height)).size).toBe(1);
      expect(new Set(row.map(card => card.actionTop)).size).toBe(1);
      expect(row.some(card => card.overflow)).toBe(false);
    }
    await page.screenshot({ path: info.outputPath(`templates-${width}.png`), fullPage: true });
  }
});

test('every preview shows configured defaults, traps focus and has no side effects', async ({ page, app }, info) => {
  test.setTimeout(120_000);
  app.projects = [];
  const ui = new WorkspacePage(page, info); await ui.goto('/templates');
  for (const template of TEMPLATES) {
    const trigger = page.getByRole('article', { name: template.name, exact: true }).getByRole('button', { name: 'View details', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: template.name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: template.name, exact: true })).toBeFocused();
    await expect(dialog).toContainText(template.description);
    for (const value of [TEAM_SIZE_LABELS[template.lockedContext.teamSize], TIMELINE_LABELS[template.lockedContext.timeline], FUNDING_LABELS[template.lockedContext.budget], EXPERIENCE_LABELS[template.lockedContext.experienceLevel]]) {
      await expect(dialog.locator('dd').filter({ hasText: value })).toHaveCount(1);
    }
    for (const [domain, fields] of Object.entries(template.lockedChoices)) {
      for (const value of Object.values(fields)) {
        const label = CARD_CHOICES[domain as DomainId]?.find(choice => choice.id === value)?.label ?? value;
        await expect(dialog.locator('dd').filter({ hasText: new RegExp(`^${label}$`) })).toHaveCount(1);
      }
    }
    await expect(dialog.locator('dd')).toHaveCount(5 + Object.values(template.lockedChoices).reduce((count, fields) => count + Object.keys(fields).length, 0));
    const content = dialog.getByRole('region', { name: 'Template details' });
    await page.keyboard.press('Tab'); await expect(content).toBeFocused();
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Start with template', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(content).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    await trigger.click(); await dialog.getByRole('button', { name: 'Close', exact: true }).click(); await expect(trigger).toBeFocused();
  }
  expect(app.projects).toHaveLength(0);
  expect(app.calls.filter(call => /^(projects\.(create|update)|sessions\.)/.test(call.procedure))).toHaveLength(0);
  expect(app.streams).toHaveLength(0);
});

test('long preview scrolls on a small screen and hands off to setup without creating', async ({ page, app }, info) => {
  app.projects = [];
  await page.setViewportSize({ width: 390, height: 420 });
  const ui = new WorkspacePage(page, info); await ui.goto('/templates');
  const template = TEMPLATES[TEMPLATES.length - 1];
  const trigger = page.getByRole('article', { name: template.name }).getByRole('button', { name: 'View details' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: template.name });
  const content = dialog.getByRole('region', { name: 'Template details' });
  expect(await content.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  const footer = dialog.getByRole('button', { name: 'Start with template', exact: true });
  const before = await footer.boundingBox();
  await content.focus(); await page.keyboard.press('PageDown');
  await expect.poll(() => content.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await content.evaluate(node => { node.scrollTop = node.scrollHeight; });
  expect(await footer.boundingBox()).toEqual(before);
  await page.screenshot({ path: info.outputPath('template-details-scrolled.png') });
  await ui.expectViewportFits();
  await footer.click();
  const setup = page.getByRole('dialog', { name: 'Name your project' });
  await expect(setup.getByRole('textbox', { name: 'Project name' })).toBeFocused();
  await expect(setup).toContainText(template.name);
  await expect(setup.getByRole('button', { name: /Start planning/ })).toBeDisabled();
  await setup.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(trigger).toBeFocused();
  expect(app.projects).toHaveLength(0);
  expect(app.calls).toHaveLength(0);
  expect(app.streams).toHaveLength(0);
});

for (const template of TEMPLATES) {
  test(`${template.name} applies its actual defaults only after setup submission`, async ({ page, app }, info) => {
    test.setTimeout(120_000);
    app.projects = [];
    const ui = new WorkspacePage(page, info); await ui.goto('/templates');
    await page.getByRole('article', { name: template.name, exact: true }).getByRole('button', { name: 'Start with template', exact: true }).click();
    const setup = page.getByRole('dialog', { name: 'Name your project' });
    await setup.getByRole('textbox', { name: 'Project name' }).fill(`${template.name} project`);
    expect(app.projects).toHaveLength(0); expect(app.streams).toHaveLength(0);
    if (template.id === 'landing-page') await page.keyboard.press('Enter');
    else await setup.getByRole('button', { name: /Start planning/ }).click();
    await ui.waitForInterview();
    expect(app.projects).toHaveLength(1);
    const create = app.calls.filter(call => call.procedure === 'projects.create');
    expect(create).toHaveLength(1); expect(create[0].input.type).toBe(template.projectType);
    const saved = app.calls.find(call => call.procedure === 'projects.update')!.input.data.interviewData;
    expect(saved).toEqual({ lockedContext: template.lockedContext, lockedChoices: template.lockedChoices, completedDomains: [], conversationHistory: [], elaboration: template.elaboration });
    expect(app.streams).toHaveLength(0);
  });
}

test('setup edits are saved without changing template definitions', async ({ page, app }, info) => {
  app.projects = [];
  const ui = new WorkspacePage(page, info); await ui.goto('/templates');
  await page.getByRole('article', { name: TEMPLATES[0].name }).getByRole('button', { name: 'Start with template', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Name your project' });
  await setup.getByRole('textbox', { name: 'Project name' }).fill('Customized project');
  await setup.getByText('Customize defaults', { exact: true }).click();
  await setup.getByRole('combobox', { name: 'Development team size' }).selectOption('small');
  await setup.getByRole('combobox', { name: 'Authentication provider' }).selectOption('clerk');
  await page.screenshot({ path: info.outputPath('template-setup-editable.png') });
  await setup.getByRole('button', { name: /Start planning/ }).click();
  await ui.waitForInterview();
  expect(app.projects[0].interviewData.lockedContext.teamSize).toBe('small');
  expect(app.projects[0].interviewData.lockedChoices.auth.authProvider).toBe('clerk');
  expect(TEMPLATES[0].lockedContext.teamSize).toBe('solo');
  expect(TEMPLATES[0].lockedChoices.auth?.authProvider).toBe('supabase');
});

test('pending template submission blocks duplicates and dismissal', async ({ page, app }, info) => {
  app.projects = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/trpc/projects.create*', async route => { requests += 1; await pending; await route.fallback(); });
  const ui = new WorkspacePage(page, info); await ui.goto('/templates');
  await ui.click('Start with template');
  const setup = page.getByRole('dialog', { name: 'Name your project' });
  await setup.getByRole('textbox', { name: 'Project name' }).fill('One project');
  try {
    await setup.getByRole('button', { name: /Start planning/ }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(setup.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    await expect(setup.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await page.keyboard.press('Escape'); await page.mouse.click(1, 1); await expect(setup).toBeVisible();
    await expect.poll(() => requests).toBe(1);
  } finally { release(); }
  await ui.waitForInterview();
  expect(app.projects).toHaveLength(1); expect(app.calls.filter(call => call.procedure === 'projects.create')).toHaveLength(1);
});
