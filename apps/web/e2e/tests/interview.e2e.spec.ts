// apps/web/e2e/tests/interview.e2e.spec.ts
// Key flow: dashboard → New Project modal → discovery → planning answer →
// architecture card pick, with one contract-validated response and an HITL
// pause at the step that plausibly needs manual input (API-key entry).
import { test, expect } from "../lib/fixtures";
import { getConsoleErrors } from "../lib/monitoring/consoleMonitor";
import {
  attachNetworkMonitor,
  getContractViolations,
} from "../lib/monitoring/networkMonitor";
import { DashboardPage } from "../lib/pages/DashboardPage";
import { InterviewPage } from "../lib/pages/InterviewPage";

test.use({ storageState: "e2e/storage-state/user.json" });

test("interview: create project → discovery → planning → architecture card", async ({
  page,
  hitl,
}, testInfo) => {
  test.setTimeout(120_000);
  // Validate projects.get (single-project fetch backing the interview page).
  attachNetworkMonitor(page, testInfo, [
    { urlPattern: /\/trpc\/projects\.get|batch.*projects\.get/, schemaPath: "e2e/contracts/projects.get.schema.json" },
  ]);

  const dashboard = new DashboardPage(page, testInfo);
  await dashboard.gotoDashboard();

  // Real flow composed from Page Object methods across two routes.
  const projectId = await dashboard.createProject(
    `E2E Interview ${Date.now()}`,
    "saas",
  );
  expect(projectId).toBeTruthy();

  const interview = new InterviewPage(page, testInfo);
  // createProject already navigated; assert we are on the interview view.
  expect(page.url()).toMatch(/\/project\/.+\/interview/);

  // HITL at the real manual step: if no provider key is configured the app
  // shows "No API key configured" — the operator adds one in Settings,
  // then resumes. No-op when a key already exists.
  if (await page.getByText(/No API key configured/i).count()) {
    await hitl("Add an Anthropic/OpenAI key in Settings → API Key, return here, then resume");
  }

  // Discovery (state transition, no page load) then planning open answer.
  await interview.submitDiscovery({
    teamSize: "solo",
    timeline: "under_1_month",
    budget: "bootstrapped",
    experience: "beginner",
  });
  await interview.expectPlanningOpener();
  await interview.answerOpenQuestion(
    "A habit tracker for remote teams — users create habits, check in daily, and see streaks on a dashboard.",
  );

  // Cards domain: inline picker, one-tap select.
  await interview.pickCard("Monolith");

  // Contract + console assertions on the validated endpoint.
  expect(getContractViolations(page)).toEqual([]);
  expect(getConsoleErrors(page)).toEqual([]);
});
