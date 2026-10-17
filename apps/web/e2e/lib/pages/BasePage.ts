// apps/web/e2e/lib/pages/BasePage.ts
// Shared Page Object base: holds the Playwright Page, a resilientLocator
// helper bound to the current test, and common navigation/wait actions.
import type { Locator, Page, TestInfo } from "@playwright/test";
import { resilientLocator } from "../resilience/resilientLocator";

export class BasePage {
  constructor(
    protected page: Page,
    protected testInfo: TestInfo,
  ) {}

  /** Resolve a locator with primary + fallbacks (runtime healing only). */
  protected find(
    primary: string,
    description: string,
    fallbacks: string[] = [],
    timeoutMs?: number,
  ): Promise<Locator> {
    return resilientLocator({
      page: this.page,
      testInfo: this.testInfo,
      primary,
      fallbacks,
      description,
      timeoutMs,
    });
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState("domcontentloaded");
  }

  getCurrentUrl(): string {
    return this.page.url();
  }

  async goto(path: string): Promise<void> {
    await this.page.goto(path, { waitUntil: "domcontentloaded" });
  }
}
