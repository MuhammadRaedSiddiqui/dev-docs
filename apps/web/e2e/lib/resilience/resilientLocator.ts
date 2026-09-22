// apps/web/e2e/lib/resilience/resilientLocator.ts
// Self-healing locator: tries `primary`, then `fallbacks` in order.
// Healing is runtime-only — it NEVER rewrites spec/Page Object sources.
// Healed matches are logged to healed-selectors.json for human review.
import type { Locator, Page, TestInfo } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ResilientLocatorOptions {
  page: Page;
  testInfo: TestInfo;
  primary: string;
  fallbacks?: string[];
  description: string;
  /** Per-attempt timeout in ms. Default 2000. */
  timeoutMs?: number;
}

interface HealedEvent {
  description: string;
  primary: string;
  matchedSelector: string;
  timestamp: string;
}

function outputDir(testInfo: TestInfo): string {
  // testInfo.outputDir is unique per test+retry — siblings of attachments.
  return testInfo.outputDir;
}

function appendHealedEvent(testInfo: TestInfo, event: HealedEvent) {
  try {
    const dir = outputDir(testInfo);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "healed-selectors.json");
    let existing: HealedEvent[] = [];
    if (fs.existsSync(file)) {
      try {
        existing = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }
    existing.push(event);
    fs.writeFileSync(file, JSON.stringify(existing, null, 2));
    void testInfo.attach("healed-selectors", {
      path: file,
      contentType: "application/json",
    });
  } catch (err) {
    // Logging must never break the test.
    console.warn(`[resilientLocator] failed to log healed event: ${err}`);
  }
}

export async function resilientLocator(
  opts: ResilientLocatorOptions,
): Promise<Locator> {
  const { page, testInfo, primary, fallbacks = [], description } = opts;
  const timeoutMs = opts.timeoutMs ?? 2000;
  const tried: string[] = [primary, ...fallbacks];

  for (const selector of tried) {
    const locator = page.locator(selector);
    try {
      // `count()` with a short timeout proves the selector resolves.
      await locator.first().waitFor({ state: "attached", timeout: timeoutMs });
      if (selector !== primary) {
        appendHealedEvent(testInfo, {
          description,
          primary,
          matchedSelector: selector,
          timestamp: new Date().toISOString(),
        });
      }
      return locator;
    } catch {
      // Try next fallback.
    }
  }

  throw new Error(
    `[resilientLocator] "${description}" matched nothing. Tried selectors:\n` +
      tried.map((s) => `  - ${s}`).join("\n"),
  );
}
