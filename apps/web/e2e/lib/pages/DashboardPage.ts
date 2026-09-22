// apps/web/e2e/lib/pages/DashboardPage.ts
// Dashboard: project grid + New Project modal (project type captured ONCE here).
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export type ProjectTypeOption = "saas" | "api" | "internal_tool" | "mobile" | "landing_page" | "other";

export class DashboardPage extends BasePage {
  constructor(page: Page, testInfo: TestInfo) {
    super(page, testInfo);
  }

  async gotoDashboard(): Promise<void> {
    // Full page load — dashboard is a real route navigation.
    await this.goto("/dashboard");
    await this.waitForPageLoad();
  }

  async openNewProjectModal(): Promise<void> {
    // Primary from DashboardPage markup ("New project" dashed tile / sidebar);
    // fallbacks cover the modal trigger variants.
    const btn = await this.find(
      'button:has-text("New project")',
      "open New Project modal",
      ['text=New Project', 'button:has-text("Start the interview")'],
    );
    await btn.first().click();
  }

  /** Creates a project via the New Project modal; lands on the interview page. */
  async createProject(name: string, type: ProjectTypeOption): Promise<string> {
    await this.openNewProjectModal();

    // Name input inside CreateProjectModal.
    const nameInput = await this.find(
      'input[name="name"]',
      "new project name input",
      ['input[placeholder*="project" i]', '[data-testid="project-name-input"]'],
    );
    await nameInput.fill(name);

    // Project type picker — a select in the modal (see legacy spec).
    const typeSelect = this.page.locator('select[name="type"]');
    if ((await typeSelect.count()) > 0) {
      await typeSelect.selectOption(type);
    } else {
      // Fallback: card/radio-style type picker.
      const typeCard = await this.find(
        `[data-project-type="${type}"]`,
        `project type option ${type}`,
        [`text=${type}`, `label:has-text("${type}")`],
      );
      await typeCard.first().click();
    }

    const createBtn = await this.find(
      'button:has-text("Create")',
      "create project submit",
      ['button[type="submit"]', 'text=Create project'],
    );
    await createBtn.click();

    // App navigates to /project/<id>/interview on success.
    await this.page.waitForURL(/\/project\/.+\/interview/, { timeout: 15000 });
    const match = this.page.url().match(/\/project\/([^/]+)\/interview/);
    return match?.[1] ?? "";
  }

  async expectProjectVisible(name: string): Promise<void> {
    const card = await this.find(
      `text=${name}`,
      `project card ${name}`,
      [`[data-project-name="${name}"]`],
    );
    await expect(card.first()).toBeVisible({ timeout: 10000 });
  }
}
