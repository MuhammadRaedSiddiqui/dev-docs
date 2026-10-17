import { expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { pauseForHuman } from '../hitl/pauseForHuman';

export class AuthenticationPage extends BasePage {
  async dashboard() {
    await this.goto('/dashboard');
    await expect(this.page.getByRole('button', { name: /New project/i }).first()).toBeVisible({ timeout: 60_000 });
    await expect.poll(async () => this.page.evaluate(() => !!(window as any).Clerk?.session)).toBe(true);
  }
  async humanAuth(label: string, signup = false) {
    await this.goto(signup ? '/sign-up' : '/sign-in');
    if (!signup) {
      await expect.poll(() => this.page.evaluate(() => !!(window as any).Clerk?.loaded), { timeout: 60_000 }).toBe(true);
      if (await this.page.evaluate(() => !!(window as any).Clerk?.user && !!(window as any).Clerk?.session)) {
        await this.dashboard();
        return;
      }
    }
    await expect(this.page.locator(signup ? '.cl-signUp-root' : '.cl-signIn-root')).toBeVisible({ timeout: 60_000 });
    await pauseForHuman({ page: this.page, testInfo: this.testInfo, timeoutMs: 15 * 60_000,
      reason: signup ? `Create NEW disposable auth-test account ${label}. ${label === 'B' ? 'This account is dedicated to deletion in this run.' : 'Do not use an existing account.'}` : `Sign in again to ${label}. Complete CAPTCHA/MFA in this browser.`,
      resumeWhen: async () => this.page.evaluate(() => !!(window as any).Clerk?.user && !!(window as any).Clerk?.session) });
    await this.dashboard();
  }
  async signOut() {
    await this.page.getByRole('button', { name: 'Account menu', exact: true }).click();
    await this.page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect.poll(() => this.page.evaluate(() => !(window as any).Clerk?.session), { timeout: 60_000 }).toBe(true);
  }
  async expectPrivateAbsent(names: string[]) {
    for (const name of names) await expect(this.page.getByText(name, { exact: true })).toHaveCount(0, { timeout: 30_000 });
  }
  async signInRecoverable() {
    await this.goto('/sign-in');
    await expect(this.page.locator('.cl-signIn-root')).toBeVisible({ timeout: 60_000 });
  }
  async deleteLocalData() {
    await this.goto('/settings?section=privacy');
    const button = this.page.getByRole('button', { name: 'Delete data & continue', exact: true });
    await expect(button).toBeDisabled();
    await this.page.getByPlaceholder('DELETE', { exact: true }).fill('DELETE');
    await expect(button).toBeEnabled();
    const response = this.page.waitForResponse(r => new URL(r.url()).pathname.includes('account.deleteData'));
    await button.click();
    expect((await response).status()).toBe(200);
    await expect(this.page.locator('.cl-userProfile-root')).toBeVisible({ timeout: 60_000 });
  }
  async ownershipUi(projectId: string, forbiddenName: string, forbiddenBody: string) {
    await this.dashboard();
    await this.expectPrivateAbsent([forbiddenName]);
    await this.goto('/docs');
    await this.expectPrivateAbsent([forbiddenName, forbiddenBody]);
    await this.goto(`/project/${projectId}/interview`);
    await expect(this.page.getByRole('alert')).toContainText('Unable to load this project', { timeout: 60_000 });
    await this.expectPrivateAbsent([forbiddenName, forbiddenBody]);
    await expect(this.page.getByRole('button', { name: /Download|Save changes|Rename|Delete project/ })).toHaveCount(0);
  }
}
