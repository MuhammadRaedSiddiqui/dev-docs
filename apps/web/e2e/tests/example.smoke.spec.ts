// apps/web/e2e/tests/example.smoke.spec.ts
// Smoke: entry point loads authenticated, key element resolves via find(),
// and console / network / contract monitors are all clean.
import { test, expect } from "../lib/fixtures";
import { getConsoleErrors } from "../lib/monitoring/consoleMonitor";
import {
  attachNetworkMonitor,
  getContractViolations,
  getFailedRequests,
  flushNetworkMonitor,
} from "../lib/monitoring/networkMonitor";
import { DashboardPage } from "../lib/pages/DashboardPage";

test.use({ storageState: "e2e/storage-state/user.json" });

test("smoke: dashboard loads with no errors", async ({ page, find }, testInfo) => {
  // Opt-in contract validation for this spec's highest-value endpoint.
  attachNetworkMonitor(page, testInfo, [
    { urlPattern: /\/trpc\/projects\.list|batch.*projects\.list/, schemaPath: "e2e/contracts/projects.list.schema.json" },
  ]);

  const dashboard = new DashboardPage(page, testInfo);
  const projectListResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname.split('/').at(-1)?.split(',').includes('projects.list') === true,
  );
  // Compose via Page Object methods — never inline raw locators here.
  await dashboard.gotoDashboard();
  const response = await projectListResponse;
  expect(response.ok(), 'Authenticated projects.list must reach the real API successfully').toBe(true);
  await response.finished();

  // Key element via find() (resilientLocator with fallbacks).
  const heading = await find({
    primary: 'text=All projects',
    fallbacks: ['text=In progress', 'text=Nothing here yet', "main"],
    description: "dashboard project list region",
  });
  await expect(heading.first()).toBeVisible({ timeout: 15000 });

  // Monitor assertions: console clean, no failed requests, no contract breaks.
  await flushNetworkMonitor(page, testInfo);
  expect(getConsoleErrors(page)).toEqual([]);
  expect(getFailedRequests(page)).toEqual([]);
  expect(getContractViolations(page)).toEqual([]);
});
