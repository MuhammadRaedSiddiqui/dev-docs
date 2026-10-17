import { expect, type Download } from '@playwright/test';
import { BasePage } from './BasePage';

/** Shared semantic UI surface for the deterministic suite. */
export class WorkspacePage extends BasePage {
  async goto(path: string) {
    await super.goto(path);
    await this.page.locator('html[data-e2e-hydrated="true"]').waitFor({ state: 'attached' });
  }
  button(name: string | RegExp) { return this.page.getByRole('button', { name }).filter({ visible: true }); }
  text(text: string | RegExp) { return this.page.getByText(text).filter({ visible: true }); }
  heading(name: string | RegExp) { return this.page.getByRole('heading', { name }).filter({ visible: true }); }
  input(placeholder: string | RegExp) { return this.page.getByPlaceholder(placeholder).filter({ visible: true }); }
  get alert() { return this.page.getByRole('alert').filter({ visible: true, hasText: /\S/ }); }
  get radios() { return this.page.getByRole('radio', { disabled: false }).filter({ visible: true }); }
  get editor() { return this.page.getByRole('textbox').filter({ visible: true }); }
  get dialogs() { return this.page.getByRole('dialog'); }
  field(name: string) { return this.page.getByRole('textbox', { name, exact: true }).filter({ visible: true }); }
  async click(name: string | RegExp) { await this.button(name).first().click(); }
  async fill(placeholder: string | RegExp, value: string) { await this.input(placeholder).fill(value); }
  async reload() { await this.page.reload(); }
  async keyboard(key: string) { await this.page.keyboard.press(key); }
  async openProject(id: string) { await this.goto(`/project/${id}/interview`); }
  async waitForInterviewRoute() {
    await this.page.waitForURL(/\/project\/.+\/interview/, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  }
  async waitForDiscovery() {
    // Creation finishes before Next navigation and project hydration. Wait for
    // both boundaries before asserting discovery, as the onboarding lane does.
    await this.waitForInterviewRoute();
    await expect(this.heading('A few quick questions')).toBeVisible({ timeout: 45_000 });
  }
  async waitForInterview() {
    await this.waitForInterviewRoute();
    await expect(this.field('Your answer')).toBeEnabled({ timeout: 45_000 });
    await expect(this.button('Retry')).toHaveCount(0);
  }
  async waitForMockSignIn() {
    await this.page.waitForURL(/\/sign-in(?:[/?]|$)/, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(this.text('Mock sign-in boundary')).toBeVisible({ timeout: 45_000 });
  }
  async discover() {
    for (const name of ['2–3 people', '1 to under 3 months', 'Bootstrapped', 'Intermediate']) await this.click(name);
    await this.click(/Start interview/);
  }
  async answer(text: string) {
    await this.field('Your answer').fill(text);
    await this.click('Send answer');
  }
  async chooseFirstCard() { await this.radios.first().check(); await this.click('Confirm choice'); }
  async expectViewportFits() {
    const size = await this.page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(size.scroll, 'No horizontal document overflow').toBeLessThanOrEqual(size.width + 1);
  }
  async expectControlInViewport(name: string | RegExp) {
    const box = await this.button(name).first().boundingBox();
    expect(box).not.toBeNull();
    const viewport = this.page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  }
  async download(name: string | RegExp): Promise<Download> {
    const dialog = this.dialogs.filter({ visible: true });
    const control = await dialog.count() ? dialog.getByRole('button', { name }).first() : this.button(name).first();
    const [download] = await Promise.all([this.page.waitForEvent('download'), control.click()]);
    return download;
  }
  async storedPreferences() { return this.page.evaluate(() => ({ ...localStorage })); }
  async setPreference(key: string, value: string) { await this.page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key, value }); }
  async expectNoExecutableMarkdown() {
    expect(await this.page.evaluate(() => (window as any).__xss)).toBeUndefined();
    await expect(this.page.locator('a[href^="javascript:"], img[onerror], script[data-xss]')).toHaveCount(0);
  }
  async confirmPrompt(value: string) { this.page.once('dialog', dialog => dialog.accept(value)); }
  async expectFocusInsideDialog() {
    expect(await this.page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  }
}
