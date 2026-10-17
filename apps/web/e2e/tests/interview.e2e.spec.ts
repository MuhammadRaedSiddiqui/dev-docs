// apps/web/e2e/tests/interview.e2e.spec.ts
// Key flow: dashboard → New Project modal → discovery → planning answer →
// architecture card pick, with one contract-validated response and an HITL
// pause at the step that plausibly needs manual input (API-key entry).
import { test, expect } from "../lib/fixtures";
import { getConsoleErrors } from "../lib/monitoring/consoleMonitor";
import {
  attachNetworkMonitor,
  getContractViolations,
  getFailedRequests,
  flushNetworkMonitor,
} from "../lib/monitoring/networkMonitor";
import { DashboardPage } from "../lib/pages/DashboardPage";
import { InterviewPage } from "../lib/pages/InterviewPage";
import { SettingsPage } from '../lib/pages/SettingsPage';
import { getActiveDomains } from '../../lib/interview/domains';

test.use({ storageState: "e2e/storage-state/user.json" });

test("interview: create project → discovery → planning → architecture card", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const spendLimit = Number(process.env.E2E_PROVIDER_SPEND_USD);
  test.skip(!(spendLimit > 0), 'Set E2E_PROVIDER_SPEND_USD after authorizing paid live usage');
  const provider = process.env.E2E_PROVIDER ?? 'anthropic';
  expect(['anthropic', 'openai', 'metamuse']).toContain(provider);
  test.skip(provider !== 'metamuse', 'Live budget calculation currently supports Meta Muse');
  const settings = new SettingsPage(page, testInfo);
  await settings.gotoSettings();
  await settings.selectActiveProvider(provider as 'anthropic' | 'openai' | 'metamuse');
  const interview = new InterviewPage(page, testInfo);
  // The cost reservation uses Meta prices; other providers need their own cap.
  const spending = await interview.limitPaidGenerations(spendLimit);
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

  await testInfo.attach('live-project', { body: JSON.stringify({ projectId, provider }), contentType: 'application/json' });
  // createProject already navigated; assert we are on the interview view.
  expect(page.url()).toMatch(/\/project\/.+\/interview/);

  // Discovery (state transition, no page load) then planning open answer.
  await interview.submitDiscovery({
    teamSize: "small",
    timeline: "1_under_3_months",
    budget: "bootstrapped",
    experience: "beginner",
  });
  await interview.expectPlanningOpener();
  await interview.answerOpenQuestion(
    "A habit tracker for remote teams — users create habits, check in daily, and see streaks on a dashboard.",
  );

  // Cards domain: inline picker, one-tap select.
  await interview.pickCard("Monolith");
  await interview.expectCompletedDomains(2, getActiveDomains('saas').length);
  await interview.reloadAndExpectCompletedDomains(2, getActiveDomains('saas').length);
  await page.screenshot({ path: testInfo.outputPath('live-interview.png'), fullPage: false });
  await testInfo.attach('provider-budget', { body: JSON.stringify(spending()), contentType: 'application/json' });

  // Contract + console assertions on the validated endpoint.
  await flushNetworkMonitor(page, testInfo);
  expect(getContractViolations(page)).toEqual([]);
  expect(getFailedRequests(page)).toEqual([]);
  expect(getConsoleErrors(page)).toEqual([]);
});
