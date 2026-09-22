// apps/web/e2e/tests/example.smoke.spec.ts
// Smoke: entry point loads authenticated, key element resolves via find(),
// and console / network / contract monitors are all clean.
import { test, expect } from "../lib/fixtures";
import { getConsoleErrors } from "../lib/monitoring/consoleMonitor";
import {
  attachNetworkMonitor,
  getContractViolations,
  getFailedRequests,
} from "../lib/monitoring/networkMonitor";
import { DashboardPage } from "../lib/pages/DashboardPage";

test.use({ storageState: "e2e/storage-state/user.json" });

test("smoke: dashboard loads with no errors", async ({ page, find }, testInfo) => {
  // Opt-in contract validation for this spec's highest-value endpoint.
  attachNetworkMonitor(page, testInfo, [
    { urlPattern: /\/trpc\/projects\.list|batch.*projects\.list/, schemaPath: "e2e/contracts/projects.list.schema.json" },
  ]);

  const dashboard = new DashboardPage(page, testInfo);
  // Compose via Page Object methods — never inline raw locators here.
  await dashboard.gotoDashboard();

  // Key element via find() (resilientLocator with fallbacks).
  const heading = await find({
    primary: 'text=All projects',
    fallbacks: ['text=In progress', 'text=Nothing here yet', "main"],
    description: "dashboard project list region",
  });
  await expect(heading.first()).toBeVisible({ timeout: 15000 });

  // Monitor assertions: console clean, no failed requests, no contract breaks.
  expect(getConsoleErrors(page)).toEqual([]);
  expect(getFailedRequests(page)).toEqual([]);
  expect(getContractViolations(page)).toEqual([]);
});
