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
    const loaded = this.page.waitForResponse(response =>
      new URL(response.url()).pathname.split('/').at(-1)?.split(',').includes('projects.list') === true,
    );
    // Full page load — dashboard is a real route navigation.
    await this.goto("/dashboard");
    await this.waitForPageLoad();
    expect((await loaded).ok(), 'Dashboard projects must load before interacting').toBe(true);
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
      'input[placeholder="e.g. TaskFlow SaaS"]',
      "new project name input",
      ['input[placeholder*="project" i]', '[data-testid="project-name-input"]'],
    );
    await nameInput.fill(name);

    const labels: Record<ProjectTypeOption, string> = { saas: 'SaaS product', api: 'API service', internal_tool: 'Internal tool', mobile: 'Mobile app', landing_page: 'Landing page', other: 'Other' };
    await this.page.getByRole('button', { name: new RegExp(`${labels[type]}$`) }).click();

    const createBtn = await this.find(
      'button:has-text("Create project")',
      "create project submit",
      ['button[type="submit"]', 'text=Create project'],
    );
    await createBtn.click();

    // App navigates to /project/<id>/interview on success.
    await this.page.waitForURL(/\/project\/.+\/interview/, { timeout: 90_000, waitUntil: 'domcontentloaded' });
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
