// apps/web/e2e/lib/pages/InterviewPage.ts
// Interview: single-view hybrid — DomainProgress (left) + ChatPanel (center)
// + PreviewPanel (right). No full-page navigations inside the flow; all
// transitions are state/visibility waits.
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import { guardLiveBudget } from '../live-budget';

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
      45_000,
    );
    await expect(heading.first()).toBeVisible({ timeout: 15000 });

    // Project type must be shown as a locked chip, not an editable field.
    const typeInput = this.page.locator('select[name="type"], input[name="projectType"]');
    await expect(typeInput).toHaveCount(0);

    const labels: Record<string, string> = { solo: 'Just me', small: '2–3 people', medium: '4–10 people', eleven_plus: '11+ people', under_1_month: 'Less than 1 month', '1_under_3_months': '1 to under 3 months', '3_under_6_months': '3 to under 6 months', '6_plus_months': '6 months or more', not_sure: 'Not sure yet', bootstrapped: 'Bootstrapped', self_funded: 'Self-funded', funded: 'Funded', beginner: 'Beginner', intermediate: 'Intermediate', experienced: 'Experienced' };
    for (const value of Object.values(input)) {
      await this.page.getByRole('button', { name: labels[value] ?? value, exact: true }).click();
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
      'textarea[placeholder="Type your answer..."]:visible',
      "interview chat input",
      ['textarea[placeholder*="answer" i]:visible', '[data-testid="chat-input"]'],
      45_000,
    );
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill(text);
    const send = await this.find(
      'button:has-text("Send"):visible',
      "interview send button",
      ['button[type="submit"]', '[aria-label="Send"]'],
    );
    await send.click();
  }

  /** Cards-mode domain: pick a card inline in the chat bubble (one-tap). */
  async pickCard(choiceLabel: string): Promise<void> {
    const providerError = this.page.getByRole('alert').filter({ hasText: /response|key|rate limit|Meta Muse/i }).filter({ visible: true });
    await expect(this.page.locator('[role="radiogroup"]:visible').or(providerError).first()).toBeVisible({ timeout: 45_000 });
    await expect(providerError, 'The provider must succeed before cards appear').toHaveCount(0);
    const group = await this.find(
      '[role="radiogroup"]:visible',
      "card picker group",
      ['[data-testid="domain-picker"]', 'div:has(> [role="radio"])'],
      45_000,
    );
    await expect(group.last()).toBeVisible({ timeout: 45_000 });
    const card = await this.find(
      `[role="radio"][aria-disabled="false"]:visible:has-text("${choiceLabel}")`,
      `card choice ${choiceLabel}`,
      [`text=${choiceLabel}`],
    );
    await card.first().click();
    // One-tap: selection immediately emits a "Selected:" user bubble.
    await expect(this.page.getByText(/Selected:/).filter({ visible: true }).last()).toBeVisible({ timeout: 10000 });
  }

  async expectPlanningOpener(): Promise<void> {
    const opener = await this.find(
      'button[aria-label="Copy message"]:visible',
      "planning opener",
      ['button:has-text("Copy")'],
      45_000,
    );
    await expect(opener.first()).toBeVisible({ timeout: 45_000 });
    await expect(opener.first().locator('..')).toContainText(/\?/, { timeout: 45_000 });
    await expect(this.page.getByPlaceholder('Type your answer...', { exact: true }).filter({ visible: true })).toBeEnabled();
  }

  async expectCompletedDomains(count: number, total: number): Promise<void> {
    await expect(this.page.getByRole('progressbar').filter({ visible: true })).toHaveAttribute('aria-valuenow', String(Math.round(count / total * 100)), { timeout: 45_000 });
    await expect(this.page.getByPlaceholder('Type your answer...', { exact: true }).filter({ visible: true })).toBeEnabled({ timeout: 45_000 });
  }

  async reloadAndExpectCompletedDomains(count: number, total: number): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.expectCompletedDomains(count, total);
  }

  async limitPaidGenerations(spendLimitUsd: number, maxRequests = 5) {
    return guardLiveBudget(this.page, this.testInfo, spendLimitUsd, maxRequests);
  }

  async expectProgress(pct: RegExp = /%$/): Promise<void> {
    await expect(this.page.getByText(pct).first()).toBeVisible({ timeout: 10000 });
  }
}
