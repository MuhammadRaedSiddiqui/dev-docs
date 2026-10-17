// apps/web/e2e/lib/pages/SettingsPage.ts
// Settings: sidebar sections (account / apikey / plan / privacy) + API key vault.
// Key handling goes through typed tRPC mutations — never localStorage.
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import type { AIProvider } from '../../../lib/ai/provider';

export class SettingsPage extends BasePage {
  constructor(page: Page, testInfo: TestInfo) {
    super(page, testInfo);
  }

  async gotoSettings(): Promise<void> {
    await this.goto("/settings");
    await this.waitForPageLoad();
  }

  async openApiKeySection(): Promise<void> {
    const tab = await this.find(
      'button:has-text("AI Providers & Keys")',
      "settings API key tab",
      ['button:has-text("API")', '[data-settings-section="apikey"]'],
    );
    await tab.first().click();
  }

  async selectActiveProvider(provider: AIProvider): Promise<void> {
    await this.openApiKeySection();
    const labels = { anthropic: 'Anthropic', openai: 'OpenAI', metamuse: 'Meta Muse', bedrock: 'Amazon Bedrock' };
    const button = this.page.getByLabel('AI provider selection', { exact: true }).getByRole('button', { name: new RegExp(`^${labels[provider]}`) });
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await button.click();
    await expect(button.getByText('Active', { exact: true })).toBeVisible();
  }

  /** Pastes a provider key and saves it via tRPC (server-verified). */
  async saveApiKey(provider: "anthropic" | "openai", key: string): Promise<void> {
    await this.openApiKeySection();
    await this.page.getByRole('button', { name: provider === 'anthropic' ? 'Anthropic' : 'OpenAI', exact: true }).click();
    const input = await this.find(
      `input[data-provider="${provider}"]`,
      `${provider} key input`,
      ['input[type="password"]', 'input[placeholder*="key" i]'],
    );
    await input.fill(key);
    const save = await this.find(
      'button:has-text("Verify & save")',
      "save API key",
      ['button[type="submit"]', 'text=Verify'],
    );
    await save.click();
  }

  async expectKeyConnected(provider: string): Promise<void> {
    await expect(this.page.getByText('Key saved', { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
  }
}
