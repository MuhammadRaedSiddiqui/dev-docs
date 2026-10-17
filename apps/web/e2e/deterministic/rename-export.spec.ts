import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect } from '../lib/mock-fixtures';
import { WorkspacePage } from '../lib/pages/WorkspacePage';
import { project } from '../lib/mocks/application';

test('rename replaces the native prompt, validates, traps focus and restores the source trigger', async ({ page, app }, info) => {
  await page.addInitScript(() => { window.prompt = () => { throw new Error('Native rename prompt must never be used'); }; });
  const first = project('landing_page', 2);
  const second = { ...project('api', 1), id: '00000000-0000-4000-a000-000000000002', name: 'Second workspace' };
  app.projects = [first, second];
  const before = JSON.parse(JSON.stringify(second));
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  const trigger = page.getByRole('button', { name: 'Project actions for Second workspace', exact: true });
  const modal = page.getByRole('dialog', { name: 'Rename project', exact: true });
  const input = modal.getByRole('textbox', { name: 'Project name', exact: true });
  const save = modal.getByRole('button', { name: 'Save changes', exact: true });
  async function open() {
    await trigger.focus(); await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Rename project' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(modal).toBeVisible(); await expect(input).toBeFocused();
    await expect(input).toHaveValue('Second workspace');
    expect(await input.evaluate(el => [(el as HTMLInputElement).selectionStart, (el as HTMLInputElement).selectionEnd])).toEqual([0, second.name.length]);
  }
  await open();
  const box = (await modal.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(400); expect(box.x).toBeGreaterThanOrEqual(16);
  expect(Math.abs(box.x + box.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(1);
  await expect(save).toBeDisabled();
  await input.fill('   Second workspace   '); await expect(save).toBeDisabled();
  for (const value of ['', '   ']) {
    await input.fill(value); await expect(save).toBeDisabled();
    await expect(modal.getByRole('alert')).toHaveText('Enter a project name.');
    await page.keyboard.press('Enter');
  }
  await input.fill('x'.repeat(101)); await expect(save).toBeDisabled();
  await expect(modal.getByRole('alert')).toContainText('100 characters or fewer');
  await input.fill('Draft workspace');
  // The modal's top layer makes the background inert, even to focus().
  await trigger.evaluate(el => el.focus()); await expect(input).toBeFocused();
  await page.keyboard.press('Tab'); await expect(modal.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(save).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(modal.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.screenshot({ path: info.outputPath('rename-dialog.png') });
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0); await expect(trigger).toBeFocused();
  await open(); await input.fill('Canceled draft'); await modal.getByRole('button', { name: 'Cancel' }).click();
  await expect(modal).toHaveCount(0); await expect(trigger).toBeFocused();
  expect(app.calls.filter(call => call.procedure === 'projects.update')).toHaveLength(0);
  await open(); await input.fill('  Renamed second workspace  '); await page.keyboard.press('Enter');
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Project actions for Renamed second workspace' })).toBeFocused();
  await expect(page.getByRole('status').filter({ hasText: 'Project renamed.' })).toBeVisible();
  expect(app.calls.filter(call => call.procedure === 'projects.update').map(call => call.input)).toEqual([
    { id: second.id, data: { name: 'Renamed second workspace' } },
  ]);
  expect(second).toEqual({ ...before, name: 'Renamed second workspace' });
  expect(first.name).toBe('Team Planner'); expect(app.streams).toHaveLength(0);
  await ui.reload();
  await expect(page.getByRole('article', { name: 'Renamed second workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Team Planner', exact: true })).toBeVisible();
});

test('rename retains a failed draft, retries once and blocks dismissal or duplicate submission while saving', async ({ page, app }, info) => {
  app.fail('projects.update', 'Rename unavailable', 1);
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await ui.click('Project actions'); await page.getByRole('menuitem', { name: 'Rename project' }).click();
  const modal = page.getByRole('dialog', { name: 'Rename project', exact: true });
  const input = modal.getByRole('textbox', { name: 'Project name' });
  await input.fill('Retry workspace'); await modal.getByRole('button', { name: 'Save changes' }).click();
  await expect(modal.getByRole('alert')).toContainText('Please try saving again');
  await expect(input).toHaveValue('Retry workspace');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let submitted = 0;
  await page.route('**/trpc/projects.update*', async route => { submitted++; await gate; await route.fallback(); });
  try {
    await modal.getByRole('button', { name: 'Save changes' }).click();
    await expect(modal.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    await expect(modal.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expect(input).toHaveAttribute('readonly', '');
    await expect(modal.getByRole('status')).toContainText('Please wait before closing');
    await expect.poll(() => submitted).toBe(1);
    await page.keyboard.press('Escape'); await expect(modal).toBeVisible();
    await input.focus(); await page.keyboard.press('Enter');
    await modal.locator('form').evaluate(el => (el as HTMLFormElement).requestSubmit());
    await page.mouse.click(4, 4); await expect(modal).toBeVisible();
    expect(submitted).toBe(1);
  } finally { release(); }
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Project actions for Retry workspace' })).toBeFocused();
  expect(app.calls.filter(call => call.procedure === 'projects.update')).toHaveLength(2);
  expect(app.streams).toHaveLength(0);
});

test('dashboard downloads only saved records for zero, partial, complete and legacy bundles', async ({ page, app }, info) => {
  const empty = project('landing_page');
  const partial = { ...project('landing_page', 2), id: '00000000-0000-4000-a000-000000000002', name: 'Partial workspace' };
  partial.documents = partial.documents.slice(0, 1);
  partial.documents[0].content = '# Manually edited\n\nKeep this text verbatim.\n\n---\n\nSaved separator.';
  Object.assign(partial.interviewData, { domainContent: { planning: 'Stale snapshot text must not be exported', frontend: 'Unsaved document' } });
  const complete = { ...project('landing_page', 4), id: '00000000-0000-4000-a000-000000000003', name: 'Complete workspace' };
  complete.documents[0].content = '';
  const legacy = { ...project('landing_page', 1), id: '00000000-0000-4000-a000-000000000004', name: 'Legacy workspace', interviewData: null };
  legacy.documents = project('saas', 6).documents.filter(document => document.domainId === 'auth');
  app.projects = [empty, partial, complete, legacy];
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await expect(page.getByText('Loading project…')).toHaveCount(0);
  await page.getByRole('button', { name: 'Project actions for Team Planner', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Download documentation' })).toBeDisabled();
  await page.keyboard.press('Escape');
  for (const saved of [partial, complete, legacy]) {
    await page.getByRole('button', { name: `Project actions for ${saved.name}`, exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Download documentation' }).click()]);
    const zip = await JSZip.loadAsync(await readFile((await download.path())!));
    const files = Object.values(zip.files).filter(file => !file.dir && file.name !== 'docs/README.md');
    expect(files).toHaveLength(saved.documents.length);
    for (const document of saved.documents) {
      expect(await zip.file(`docs/${document.domainId.toUpperCase()}.md`)!.async('string')).toBe(document.content);
    }
    expect(await zip.file('docs/README.md')!.async('string')).not.toContain('Unsaved document');
  }
  expect(app.streams).toHaveLength(0);
  expect(app.calls.filter(call => call.procedure === 'documents.update' || call.procedure === 'projects.update')).toHaveLength(0);
});

test('download preparation prevents duplicates and exposes an inline retry after failure', async ({ page, app }, info) => {
  app.projects = [project('landing_page', 1)];
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await expect(page.getByText('Loading project…')).toHaveCount(0);
  const trigger = page.getByRole('button', { name: 'Project actions for Team Planner', exact: true });
  const card = page.getByRole('article', { name: 'Team Planner', exact: true });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/trpc/projects.get*', async route => { await gate; await route.fallback(); });
  app.fail('projects.get', 'Export unavailable', 1);
  try {
    await trigger.click(); await page.getByRole('menuitem', { name: 'Download documentation' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Preparing documentation…' })).toBeVisible();
    await trigger.click(); await expect(page.getByRole('menuitem', { name: 'Preparing documentation…' })).toBeDisabled();
    await page.keyboard.press('Escape');
  } finally { release(); }
  await expect(card.getByRole('alert')).toContainText('Could not download saved documentation');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Retry download' }).click()]);
  expect(download.suggestedFilename()).toBe('team-planner-docs.zip');
  await expect(card.getByRole('alert')).toHaveCount(0);
  expect(app.streams).toHaveLength(0);
});

test('dashboard blocks exports while document edits are unsaved and still allows rename', async ({ page, app, isMobile }, info) => {
  test.setTimeout(120_000);
  const saved = { ...project('landing_page', 4), status: 'in_progress' };
  app.projects = [saved];
  const before = JSON.parse(JSON.stringify(saved));
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await page.getByRole('link', { name: 'Team Planner', exact: true }).click();
  if (isMobile) await ui.click(/^Document /);
  await ui.click('Edit'); await ui.field('Planning & Scope documentation').fill('## Unsaved draft');
  if (isMobile) await ui.click('Close');
  await page.goBack(); await expect(page).toHaveURL(/\/dashboard$/);
  const card = page.getByRole('article', { name: 'Team Planner', exact: true });
  await expect(card.getByText('Save or discard document edits before downloading.')).toBeVisible();
  await card.getByRole('button', { name: 'Project actions for Team Planner', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Download documentation' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Rename project' }).click();
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Renamed with a draft');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Renamed with a draft', exact: true }).getByText('Save or discard document edits before downloading.')).toBeVisible();
  expect(saved.id).toBe(before.id);
  expect(saved.documents).toEqual(before.documents);
  expect(saved.interviewData.completedDomains).toEqual(before.interviewData.completedDomains);
  expect(app.calls.filter(call => call.procedure === 'projects.update' && call.input.data.name).map(call => call.input)).toEqual([
    { id: saved.id, data: { name: 'Renamed with a draft' } },
  ]);
  expect(app.streams).toHaveLength(0);
});
