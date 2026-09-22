// apps/web/e2e/lib/pages/SettingsPage.ts
// Settings: sidebar sections (account / apikey / plan / privacy) + API key vault.
// Key handling goes through typed tRPC mutations — never localStorage.
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

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
      'text=API Key',
      "settings API key tab",
      ['button:has-text("API")', '[data-settings-section="apikey"]'],
    );
    await tab.first().click();
  }

  /** Pastes a provider key and saves it via tRPC (server-verified). */
  async saveApiKey(provider: "anthropic" | "openai", key: string): Promise<void> {
    await this.openApiKeySection();
    const input = await this.find(
      `input[data-provider="${provider}"]`,
      `${provider} key input`,
      ['input[type="password"]', 'input[placeholder*="key" i]'],
    );
    await input.fill(key);
    const save = await this.find(
      'button:has-text("Save")',
      "save API key",
      ['button[type="submit"]', 'text=Verify'],
    );
    await save.click();
  }

  async expectKeyConnected(provider: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(`connected|${provider}`, "i")).first()).toBeVisible({
      timeout: 15000,
    });
  }
}
