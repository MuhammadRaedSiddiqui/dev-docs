// apps/web/e2e/lib/fixtures.ts
// Single import point for every spec: `import { test, expect } from "../lib/fixtures"`.
// Wires network + console monitors into the `page` fixture and runs
// classifyFailure() on teardown when the test failed.
import { test as base, type Locator } from "@playwright/test";
import { attachConsoleMonitor } from "./monitoring/consoleMonitor";
import { attachNetworkMonitor, flushNetworkMonitor } from "./monitoring/networkMonitor";
import { pauseForHuman } from "./hitl/pauseForHuman";
import { resilientLocator } from "./resilience/resilientLocator";
import { classifyFailure } from "./triage/classifyFailure";

type HitlFn = (reason: string, opts?: { timeoutMs?: number }) => Promise<void>;
type FindFn = (opts: {
  primary: string;
  fallbacks?: string[];
  description: string;
}) => Promise<Locator>;

export const test = base.extend<{ hitl: HitlFn; find: FindFn }>({
  page: async ({ page }, use, testInfo) => {
    // No contract list here by default — specs opt in per matched pattern
    // by calling attachNetworkMonitor again with contracts, or via
    // test.use() context. The base attach always logs requests.
    attachNetworkMonitor(page, testInfo);
    attachConsoleMonitor(page, testInfo);
    await use(page);
    await flushNetworkMonitor(page, testInfo);
    if (testInfo.status !== testInfo.expectedStatus) {
      // Guaranteed triage on failure (never opt-in per spec).
      await classifyFailure(testInfo);
    }
  },

  hitl: async ({ page }, use, testInfo) => {
    await use((reason, opts = {}) =>
      pauseForHuman({ page, testInfo, reason, ...opts }),
    );
  },

  find: async ({ page }, use, testInfo) => {
    await use((opts) => resilientLocator({ page, testInfo, ...opts }));
  },
});

export { expect } from "@playwright/test";
