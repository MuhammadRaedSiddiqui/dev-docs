import { test, expect } from '../lib/mock-fixtures';
import { WorkspacePage } from '../lib/pages/WorkspacePage';
import { project } from '../lib/mocks/application';

test('dashboard empty state and project creation validation', async ({ page, app }, info) => {
  test.setTimeout(120_000);
  app.projects = [];
  const ui = new WorkspacePage(page, info);
  await ui.goto('/dashboard');
  await expect(ui.text('Nothing here yet')).toBeVisible();
  await ui.click(/New project/i);
  await expect(ui.button(/^(Create project|Next)/)).toBeDisabled();
  await ui.fill('e.g. TaskFlow SaaS', '   ');
  await ui.click(/SaaS product$/);
  await expect(ui.button(/^(Create project|Next)/)).toBeDisabled();
  await ui.fill('e.g. TaskFlow SaaS', 'My new workspace');
  await ui.click(/Create project/);
  await ui.waitForDiscovery();
  expect(app.projects[0].name).toBe('My new workspace');
  expect(app.projects[0].type).toBe('saas');
});

test('project creation failure is visible and retry succeeds', async ({ page, app }, info) => {
  test.setTimeout(120_000);
  app.fail('projects.create', 'Creation failed. Please retry.', 1);
  const ui = new WorkspacePage(page, info);
  await ui.goto('/dashboard'); await ui.click(/New project/i);
  await ui.fill('e.g. TaskFlow SaaS', 'Recovery project'); await ui.click(/API service$/);
  await ui.click(/Create project/);
  await expect(ui.alert.filter({ hasText: 'Creation failed. Please retry.' })).toBeVisible();
  await expect(ui.input('e.g. TaskFlow SaaS')).toHaveValue('Recovery project');
  await expect(ui.button(/API service$/)).toHaveAttribute('aria-pressed', 'true');
  await ui.click(/Create project/);
  await ui.waitForDiscovery();
});

test('project rename and delete persist after reload', async ({ page, app }, info) => {
  const ui = new WorkspacePage(page, info);
  await ui.goto('/dashboard'); await ui.click('Project actions');
  await page.getByRole('menuitem', { name: 'Rename project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Renamed workspace');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(ui.text('Renamed workspace')).toBeVisible();
  await ui.reload(); await expect(ui.text('Renamed workspace')).toBeVisible();
  await ui.click('Project actions'); await page.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete project', exact: true });
  await expect(confirmation).toContainText('Renamed workspace');
  expect(app.calls.filter(call => call.procedure === 'projects.delete')).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('delete-confirmation.png') });
  await confirmation.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(ui.text('Nothing here yet')).toBeVisible();
  expect(app.projects).toHaveLength(0);
  await ui.reload(); await expect(ui.text('Nothing here yet')).toBeVisible();
});

test('delete failure preserves project and retries in the confirmation dialog', async ({ page, app }, info) => {
  app.fail('projects.delete', 'Could not delete project', 1);
  const ui = new WorkspacePage(page, info);
  await ui.goto('/dashboard'); await ui.click('Project actions'); await page.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete project', exact: true });
  await confirmation.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toHaveText('Could not delete project');
  expect(app.projects).toHaveLength(1);
  await expect(confirmation.getByRole('button', { name: 'Delete project', exact: true })).toBeEnabled();
  await confirmation.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(ui.text('Nothing here yet')).toBeVisible();
  expect(app.calls.filter(call => call.procedure === 'projects.delete')).toHaveLength(2);
});

test('delete confirmation cancels safely and restores focus', async ({ page, app }, info) => {
  app.projects[0].name = 'A project with a long name '.repeat(3).trim();
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  const trigger = page.getByRole('button', { name: `Project actions for ${app.projects[0].name}`, exact: true });
  const confirmation = page.getByRole('dialog', { name: 'Delete project', exact: true });
  async function openConfirmation() {
    await trigger.click(); await page.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
    await expect(confirmation).toContainText(app.projects[0].name);
    await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  }
  await openConfirmation();
  const box = (await confirmation.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirmation).toHaveCount(0); await expect(trigger).toBeFocused();
  await openConfirmation(); await ui.keyboard('Escape');
  await expect(confirmation).toHaveCount(0); await expect(trigger).toBeFocused();
  await openConfirmation(); await page.mouse.click(1, 1);
  await expect(confirmation).toHaveCount(0); await expect(trigger).toBeFocused();
  expect(app.projects).toHaveLength(1);
  expect(app.calls.filter(call => call.procedure === 'projects.delete')).toHaveLength(0);
});

test('pending delete blocks dismissal and duplicate submissions', async ({ page, app }, info) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/trpc/projects.delete*', async route => { requests += 1; await pending; await route.fallback(); });
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await ui.click('Project actions'); await page.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Delete project', exact: true });
  try {
    await confirmation.getByRole('button', { name: 'Delete project', exact: true }).evaluate(button => {
      (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click();
    });
    await expect(confirmation.getByRole('button', { name: 'Deleting…', exact: true })).toBeDisabled();
    await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await ui.keyboard('Escape'); await page.mouse.click(1, 1);
    await expect(confirmation).toBeVisible();
    await expect.poll(() => requests).toBe(1);
    expect(app.projects).toHaveLength(1);
  } finally { release(); }
  await expect(confirmation).toHaveCount(0);
  await expect(ui.text('Nothing here yet')).toBeVisible();
  expect(app.calls.filter(call => call.procedure === 'projects.delete')).toHaveLength(1);
});

test('dashboard loading failure is actionable', async ({ page, app }, info) => {
  app.fail('projects.list');
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await expect(ui.text(/Unable to load projects/)).toBeVisible({ timeout: 20_000 });
});

test('project-specific progress uses active domain count', async ({ page, app }, info) => {
  app.projects = [project('landing_page', 2)];
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await expect(ui.text('2 of 4 domains saved')).toBeVisible();
  await expect(ui.text('2 of 4 domains completed')).toBeVisible();
  await ui.expectViewportFits();
});

test('project menu remains inside viewport', async ({ page }, info) => {
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await ui.click('Project actions');
  const box = await page.getByRole('menuitem', { name: 'Delete project', exact: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('search keyboard navigation and no-results recovery', async ({ page }, info) => {
  test.setTimeout(120_000);
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await ui.keyboard('Control+k'); await ui.fill('Search projects and documents', 'missing project');
  await expect(ui.text('No results found')).toBeVisible();
  await ui.keyboard('ArrowDown');
  await ui.fill('Search projects and documents', 'Team Planner');
  await ui.keyboard('Enter');
  await ui.waitForInterview();
});

test('template creates a project with saved choices', async ({ page, app }, info) => {
  test.setTimeout(120_000);
  const ui = new WorkspacePage(page, info); await ui.goto('/templates');
  await ui.click('Start with template'); await ui.fill('e.g. My SaaS App', 'Template workspace');
  await ui.click(/Start planning/);
  await ui.waitForInterview();
  const created = app.projects.find(p => p.name === 'Template workspace');
  expect(created?.interviewData?.lockedContext).toBeTruthy();
  expect(created?.interviewData?.lockedChoices).toBeTruthy();
});

test('template creation failure reports error without uncaught rejection', async ({ page, app }, info) => {
  app.fail('projects.create', 'Template creation unavailable');
  const ui = new WorkspacePage(page, info); await ui.goto('/templates');
  await ui.click('Start with template'); await ui.fill('e.g. My SaaS App', 'Template failure');
  await ui.click(/Start planning/);
  await expect(page.getByRole('dialog', { name: 'Name your project' }).getByRole('alert')).toHaveText('Template creation unavailable');
});
