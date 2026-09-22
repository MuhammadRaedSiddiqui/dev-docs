// apps/web/e2e/lib/pages/InterviewPage.ts
// Interview: single-view hybrid — DomainProgress (left) + ChatPanel (center)
// + PreviewPanel (right). No full-page navigations inside the flow; all
// transitions are state/visibility waits.
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class InterviewPage extends BasePage {
  constructor(page: Page, testInfo: TestInfo) {
    super(page, testInfo);
  }

  async gotoInterview(projectId: string): Promise<void> {
    await this.goto(`/project/${projectId}/interview`);
    await this.waitForPageLoad();
  }

  /** Discovery form — project type is a locked read-only chip, never asked again. */
  async submitDiscovery(input: {
    teamSize: string;
    timeline: string;
    budget: string;
    experience: string;
  }): Promise<void> {
    const heading = await this.find(
      'text=A few quick questions',
      "discovery form heading",
      ['form:has(button:has-text("Start"))', 'text=quick questions'],
    );
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    // Project type must be shown as a locked chip, not an editable field.
    const typeInput = this.page.locator('select[name="type"], input[name="projectType"]');
    await expect(typeInput).toHaveCount(0);

    for (const [key, value] of Object.entries(input)) {
      const option = await this.find(
        `[data-discovery="${key}"][data-value="${value}"]`,
        `discovery option ${key}=${value}`,
        [`label:has-text("${value}")`, `button:has-text("${value}")`],
      );
      await option.first().click();
    }

    const start = await this.find(
      'button:has-text("Start")',
      "discovery submit",
      ['button[type="submit"]', 'text=Begin interview'],
    );
    await start.click();
  }

  /** Open-mode domain: type a free-text answer and send. */
  async answerOpenQuestion(text: string): Promise<void> {
    const input = await this.find(
      'input[placeholder="Type your answer..."]',
      "interview chat input",
      ['textarea[placeholder*="answer" i]', '[data-testid="chat-input"]'],
    );
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill(text);
    const send = await this.find(
      'button:has-text("Send")',
      "interview send button",
      ['button[type="submit"]', '[aria-label="Send"]'],
    );
    await send.click();
  }

  /** Cards-mode domain: pick a card inline in the chat bubble (one-tap). */
  async pickCard(choiceLabel: string): Promise<void> {
    const group = await this.find(
      '[role="radiogroup"]',
      "card picker group",
      ['[data-testid="domain-picker"]', 'div:has(> [role="radio"])'],
    );
    await expect(group).toBeVisible({ timeout: 10000 });
    const card = await this.find(
      `[role="radio"]:has-text("${choiceLabel}")`,
      `card choice ${choiceLabel}`,
      [`text=${choiceLabel}`],
    );
    await card.first().click();
    // One-tap: selection immediately emits a "Selected:" user bubble.
    await expect(this.page.getByText(/Selected:/)).toBeVisible({ timeout: 10000 });
  }

  async expectPlanningOpener(): Promise<void> {
    const opener = await this.find(
      'text=tell me about the project itself',
      "planning opener",
      ['text=what does it do', 'text=core thing a user does'],
    );
    await expect(opener.first()).toBeVisible({ timeout: 15000 });
  }

  async expectProgress(pct: RegExp = /%$/): Promise<void> {
    await expect(this.page.getByText(pct).first()).toBeVisible({ timeout: 10000 });
  }
}
