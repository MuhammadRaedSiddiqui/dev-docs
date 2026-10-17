import { test, expect } from '../lib/mock-fixtures';
import { WorkspacePage } from '../lib/pages/WorkspacePage';
import { project } from '../lib/mocks/application';

function workspace(name: string, index: number, completed = 0) {
  const p = project('landing_page', completed);
  p.id = `00000000-0000-4000-a000-${String(index).padStart(12, '0')}`;
  p.name = name;
  p.documents = p.documents.map(d => ({ ...d, id: `${p.id}-${d.domainId}`, projectId: p.id }));
  return p;
}

test('card actions use persisted interview state and canonical documents independently', async ({ page, app }, info) => {
  const fresh = { ...workspace('New project', 1), interviewData: null };
  const underway = workspace('Started with zero documents', 2);
  underway.interviewData.conversationHistory = [{ role: 'user', content: 'Help me plan my app.', domainId: 'planning' }];
  const partial = workspace('Partially planned', 3, 2);
  partial.documents = partial.documents.slice(0, 1);
  const complete = workspace('Finished project', 4, 4);
  // An empty but saved Markdown record is still accessible in the library.
  complete.documents[0].content = '';
  const awaiting = { ...workspace('Awaiting completion', 5, 4), status: 'in_progress' };
  const missing = { ...workspace('Finished without documents', 6, 4), documents: [] };
  const archived = { ...workspace('Archived project', 7, 1), status: 'archived' };
  const review = { ...workspace('Inconsistent completion', 8, 1), status: 'complete' };
  const ready = workspace('Documents without interview progress', 9);
  ready.documents = project('saas', 6).documents.filter(d => d.domainId === 'auth').map(d => ({ ...d, id: `${ready.id}-${d.domainId}`, projectId: ready.id }));
  const invalid = { ...workspace('Invalid saved setup', 10), interviewData: { lockedContext: 'invalid' } };
  const legacy = { ...workspace('Legacy completed project', 11, 4), interviewData: null };
  const archivedEmpty = { ...workspace('Archived without saved progress', 12), interviewData: null, status: 'archived' };
  app.projects = [fresh, underway, partial, complete, awaiting, missing, archived, review, ready, invalid, legacy, archivedEmpty];
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  const cases = [
    [fresh, 'Not started', 'Start interview', '0 of 4 domains saved'],
    [underway, 'Planning in progress', 'Continue planning', '0 of 4 domains saved'],
    [partial, 'Planning in progress', 'Continue planning', '1 of 4 domains saved'],
    [complete, 'Complete', 'View documents', '4 of 4 domains saved'],
    [awaiting, 'Awaiting completion', 'Review planning', '4 of 4 domains saved'],
    [missing, 'Planning complete', 'Review planning', '0 of 4 domains saved'],
    [archived, 'Archived', 'View documents', '1 of 4 domains saved'],
    [review, 'Completion needs review', 'Continue planning', '1 of 4 domains saved'],
    [ready, 'Ready to start', 'Start interview', '0 of 4 domains saved'],
    [invalid, 'Setup needs review', 'Review setup', '0 of 4 domains saved'],
    [legacy, 'Complete', 'View documents', '4 of 4 domains saved'],
    [archivedEmpty, 'Archived', 'Open project', '0 of 4 domains saved'],
  ] as const;
  for (const [p, status, action, progress] of cases) {
    const card = page.getByRole('article', { name: p.name, exact: true });
    await expect(card.getByRole('paragraph').filter({ hasText: new RegExp(`^${status}$`) })).toBeVisible();
    await expect(card.getByText(progress, { exact: true })).toBeVisible();
    const href = action === 'View documents' ? `/docs?project=${p.id}` : `/project/${p.id}/interview`;
    await expect(card.getByRole('link', { name: action, exact: true })).toHaveAttribute('href', href);
    await expect(card.getByRole('link', { name: p.name, exact: true })).toHaveAttribute('href', href);
    await expect(card.getByText('Updated Just now', { exact: true })).toBeVisible();
  }
  for (const p of [partial, awaiting, review, ready]) {
    await expect(page.getByRole('article', { name: p.name, exact: true }).getByRole('link', { name: 'View saved documents', exact: true })).toHaveAttribute('href', `/docs?project=${p.id}`);
  }
  await expect(page.getByRole('article', { name: partial.name, exact: true }).getByText('2 of 4 domains completed')).toBeVisible();
  for (const p of [legacy, archivedEmpty]) {
    await expect(page.getByRole('article', { name: p.name, exact: true }).getByText('Saved interview progress unavailable')).toBeVisible();
  }
  await info.attach('state-coverage', { body: JSON.stringify(cases.map(([p, status, action, progress]) => ({ name: p.name, status, action, progress, savedDomains: p.documents.map(d => d.domainId) }))), contentType: 'application/json' });
  await expect(page.locator('article a a, article a button, article button a, article button button')).toHaveCount(0);
  // Return through the existing route; completed domains and document bodies survive.
  const savedDomains = [...partial.interviewData.completedDomains];
  await page.getByRole('article', { name: partial.name, exact: true }).getByRole('link', { name: partial.name, exact: true }).click();
  await ui.waitForInterview();
  expect(partial.interviewData.completedDomains).toEqual(savedDomains);
  expect(partial.documents).toHaveLength(1);
});

test('document action opens the existing library filtered to the selected project', async ({ page, app }, info) => {
  const chosen = workspace('Selected workspace', 1, 4);
  const other = workspace('Other workspace', 2, 1);
  app.projects = [chosen, other];
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await page.getByRole('article', { name: chosen.name }).getByRole('link', { name: 'View documents', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/docs\\?project=${chosen.id}`));
  await expect(page.getByRole('button', { name: /PLANNING.md/ })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /ARCHITECTURE.md/ })).toHaveCount(1);
  await page.getByRole('button', { name: /PLANNING.md/ }).click();
  await expect(ui.text('Saved planning decisions.')).toBeVisible();
});

test('detail failure has honest fallback metadata and retry without losing project navigation', async ({ page, app }, info) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/trpc/projects.get*', async route => { await pending; await route.fallback(); });
  app.fail('projects.get', 'Details unavailable');
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  const card = page.getByRole('article', { name: 'Team Planner' });
  await expect(card.getByRole('button', { name: 'Loading project…', exact: true })).toBeDisabled();
  await expect(card.getByText('Loading saved documents…').first()).toBeVisible();
  release();
  await expect(card.getByText('Saved-document count unavailable')).toBeVisible({ timeout: 20000 });
  await expect(card.getByRole('link', { name: 'Open project', exact: true })).toHaveAttribute('href', `/project/${app.projects[0].id}/interview`);
  app.failures['projects.get'].remaining = 0;
  await card.getByRole('button', { name: 'Retry project details' }).click();
  await expect(card.getByRole('link', { name: 'Start interview', exact: true })).toBeVisible();
});

test('sorting, keyboard menu and download work without card navigation', async ({ page, app }, info) => {
  app.projects = [workspace('Zebra workspace', 1, 1), workspace('Alpha workspace', 2), workspace('Completed workspace', 3, 4)];
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  const sort = page.getByRole('group', { name: 'Sort projects' });
  await sort.getByRole('button', { name: 'name', exact: true }).click();
  await expect(sort.getByRole('button', { name: 'name', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const selected = sort.getByRole('button', { name: 'name', exact: true });
  const selection = await selected.evaluate(el => ({ border: getComputedStyle(el).borderWidth, outline: getComputedStyle(el).outlineStyle, weight: getComputedStyle(el).fontWeight, background: getComputedStyle(el).backgroundColor }));
  expect(selection.border).toBe('0px'); expect(selection.outline).toBe('none'); expect(selection.weight).toBe('600'); expect(selection.background).not.toBe('rgba(0, 0, 0, 0)');
  await selected.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  expect(await selected.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineWidth === '2px')).toBe(true);
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Alpha workspace');
  await sort.getByRole('button', { name: 'progress', exact: true }).click();
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Completed workspace');
  await sort.getByRole('button', { name: 'recent', exact: true }).click();
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Zebra workspace');
  const trigger = page.getByRole('button', { name: 'Project actions for Zebra workspace', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Rename project', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Download documentation', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard$/);
  await trigger.click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Download documentation', exact: true }).click()]);
  expect(download.suggestedFilename()).toBe('zebra-workspace-docs.zip');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('card footers align and portal menus avoid layout shift, clipping and focus theft', async ({ page, app }, info) => {
  test.setTimeout(120_000);
  const names = ['Short name', 'Long project name with wrapped planning metadata and saved documentation', 'SuperLongUnbrokenProjectNameThatMustWrapWithoutClippingOrChangingTheActionFooter', 'Empty project', 'Completed workspace', 'Last project with saved documents'];
  app.projects = names.map((name, index) => workspace(name, index + 1, [0, 1, 2, 0, 4, 1][index]));
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await expect(page.getByText('Loading project…')).toHaveCount(0);
  const statistics = page.getByLabel('Project statistics');
  await expect(statistics.locator(':scope > div')).toHaveCount(4);
  for (const [label, value] of [['Total projects', '6'], ['In progress', '5'], ['Complete', '1'], ['Interview domains completed', '8']]) {
    const metric = statistics.locator(':scope > div').filter({ has: page.getByText(label, { exact: true }) });
    await expect(metric.locator('dd')).toHaveText(value);
    expect(await metric.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('1px');
  }
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await ui.expectViewportFits();
    const metricRows = await statistics.locator(':scope > div').evaluateAll(metrics => metrics.map(el => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(metricRows).size).toBe(width >= 1024 ? 1 : 2);
    const title = page.getByRole('article').first().getByRole('link', { name: names[0], exact: true });
    expect(await title.evaluate(el => getComputedStyle(el).textDecorationLine)).toBe('none');
    await title.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    expect(await title.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineWidth === '2px')).toBe(true);
    const rows = await page.getByRole('article').evaluateAll(cards => cards.map(card => {
      const box = card.getBoundingClientRect();
      const primary = card.querySelector('a[class*="primaryAction"]')!.getBoundingClientRect();
      return { top: box.top, height: box.height, primaryTop: primary.top };
    }));
    for (const card of rows) for (const sibling of rows.filter(row => Math.abs(row.top - card.top) < 1)) {
      expect(Math.abs(card.height - sibling.height)).toBeLessThan(1);
      expect(Math.abs(card.primaryTop - sibling.primaryTop)).toBeLessThan(1);
    }
    await expect(page.getByRole('article', { name: 'Empty project', exact: true }).getByText('No saved documents yet.', { exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Completed workspace', exact: true }).getByRole('link', { name: 'View saved documents', exact: true })).toBeAttached();
    for (const name of names) {
      const trigger = page.getByRole('button', { name: `Project actions for ${name}`, exact: true });
      await trigger.scrollIntoViewIfNeeded();
      const card = page.getByRole('article', { name, exact: true });
      const before = await card.boundingBox();
      const neighbors = await page.getByRole('article').evaluateAll(cards => cards.map(el => { const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }));
      await trigger.click();
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      expect(await menu.evaluate(el => el.parentElement === document.body)).toBe(true);
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(await trigger.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      expect(await card.boundingBox()).toEqual(before);
      expect(await page.getByRole('article').evaluateAll(cards => cards.map(el => { const box = el.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; }))).toEqual(neighbors);
      const box = (await menu.boundingBox())!;
      expect(box.width).toBe(240);
      expect(box.x).toBeGreaterThanOrEqual(8);
      expect(box.y).toBeGreaterThanOrEqual(8);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 8);
      expect(box.y + box.height).toBeLessThanOrEqual(992);
      const rightFits = before!.x + before!.width + 8 + box.width <= width - 8;
      const leftFits = before!.x - box.width - 8 >= 8;
      const placement = rightFits ? 'right' : leftFits ? 'left' : 'below';
      await expect(menu).toHaveAttribute('data-placement', placement);
      if (placement === 'right') expect(Math.abs(box.x - (before!.x + before!.width + 8))).toBeLessThan(1);
      if (placement === 'left') expect(Math.abs(box.x + box.width - (before!.x - 8))).toBeLessThan(1);
      const triggerBox = (await trigger.boundingBox())!;
      const preferredTop = placement === 'below' ? triggerBox.y + triggerBox.height + 8 : triggerBox.y;
      expect(Math.abs(box.y - Math.max(8, Math.min(preferredTop, 992 - box.height)))).toBeLessThan(1);
      if (placement !== 'below') {
        const center = triggerBox.y + triggerBox.height / 2;
        const pointer = menu.locator('span[aria-hidden="true"]');
        if (center >= box.y + 13 && center <= box.y + box.height - 11) {
          const pointerBox = (await pointer.boundingBox())!;
          expect(Math.abs(pointerBox.y + pointerBox.height / 2 - center)).toBeLessThan(1);
        } else await expect(pointer).toHaveCount(0);
      } else await expect(menu.locator('span[aria-hidden="true"]')).toHaveCount(0);
      if (width === 1440 && name === names[0]) {
        const heading = (await page.getByRole('article').nth(1).locator('h2').boundingBox())!;
        expect(box.x < heading.x + heading.width && box.x + box.width > heading.x && box.y < heading.y + heading.height && box.y + box.height > heading.y).toBe(true);
      }
      await ui.expectViewportFits();
      await page.screenshot({ path: info.outputPath(`menu-${width}-${names.indexOf(name) + 1}.png`) });
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
  }
  // A short viewport shifts the side menu upward to keep its entire surface visible.
  await page.setViewportSize({ width: 1440, height: 300 });
  const trigger = page.getByRole('button', { name: `Project actions for ${names[0]}`, exact: true });
  await trigger.scrollIntoViewIfNeeded(); await trigger.click();
  const menu = page.getByRole('menu');
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.y).toBeGreaterThanOrEqual(8);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(292);
  await expect(menu.getByRole('menuitem', { name: 'Download documentation', exact: true })).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Delete project', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: 'Rename project', exact: true })).toBeFocused();
  const focus = await page.getByRole('menuitem', { name: 'Rename project', exact: true }).evaluate(el => ({ outline: getComputedStyle(el).outlineStyle, decoration: getComputedStyle(el).textDecorationLine, background: getComputedStyle(el).backgroundColor }));
  expect(focus.outline).toBe('none'); expect(focus.decoration).toContain('underline'); expect(focus.background).not.toBe('rgba(0, 0, 0, 0)');
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('article', { name: names[0], exact: true }).getByRole('link', { name: 'Start interview', exact: true })).toBeFocused();
  await trigger.focus(); await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Delete project', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await trigger.click();
  const sort = page.getByRole('button', { name: 'name', exact: true });
  await sort.click();
  await expect(sort).toBeFocused(); await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('long names, card metadata and controls fit mobile, tablet and desktop with AA contrast', async ({ page, app }, info) => {
  app.projects = [workspace('A very long project name for a personal document workspace with planning and saved requirements', 1, 2), workspace('SuperLongUnbrokenProjectNameForTestingResponsiveWrappingAndAccessibleProjectNavigation', 2)];
  const ui = new WorkspacePage(page, info); await ui.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Continue planning', exact: true })).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await ui.expectViewportFits();
    const measurement = await page.evaluate(() => {
      const rgb = (s: string) => s.match(/[\d.]+/g)!.map(Number);
      const luminance = (s: string) => rgb(s).slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      function background(el: Element | null): string {
        if (!el) return 'rgb(255, 255, 255)';
        const color = getComputedStyle(el).backgroundColor, values = rgb(color);
        if (values.length < 4 || values[3] === 1) return color;
        const parent = rgb(background(el.parentElement));
        return `rgb(${values.slice(0, 3).map((v, i) => v * values[3] + parent[i] * (1 - values[3])).join(', ')})`;
      }
      const pairs = new Map<string, { color: string; background: string; ratio: number }>();
      const failures: string[] = [];
      for (const root of [document.querySelector('aside')!, document.querySelector('main')!]) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode, el = node.parentElement!;
          if (!node.textContent?.trim() || !el.getClientRects().length) continue;
          const s = getComputedStyle(el), bg = background(el), a = luminance(s.color), b = luminance(bg);
          const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
          pairs.set(s.color + bg, { color: s.color, background: bg, ratio: Number(ratio.toFixed(2)) });
          if (ratio < 4.5) failures.push(node.textContent);
        }
      }
      const cards = [...document.querySelectorAll('article')].map(el => ({ width: el.getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth + 1 }));
      return { pairs: [...pairs.values()], failures, cards };
    });
    expect(measurement.failures).toEqual([]);
    expect(measurement.cards.every(card => !card.overflow)).toBe(true);
    await info.attach(`dashboard-${width}-contrast`, { body: JSON.stringify(measurement), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`dashboard-${width}.png`), fullPage: true });
    await page.getByRole('article').first().screenshot({ path: info.outputPath(`card-${width}.png`) });
  }
  const action = page.getByRole('link', { name: 'Continue planning', exact: true });
  await action.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  const focus = await action.evaluate(el => ({ visible: el.matches(':focus-visible'), width: getComputedStyle(el).outlineWidth }));
  expect(focus.visible).toBe(true); expect(focus.width).toBe('2px');
});
