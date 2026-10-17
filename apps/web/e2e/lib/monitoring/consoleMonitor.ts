// apps/web/e2e/lib/monitoring/consoleMonitor.ts
// Buckets console messages + page errors/crashes per test.
// Benign warnings matching KNOWN_WARNINGS never fail assertions.
import type { Page, TestInfo } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { redactText, redactUrl } from './redact';

export interface ConsoleEntry {
  kind: "console" | "pageerror" | "crash";
  type: string;
  text: string;
  location: string | null;
  timestamp: string;
}

/** Benign, expected warnings — matched against the message text. */
export const KNOWN_WARNINGS: RegExp[] = [
  /React DevTools/i,
  /Download the React DevTools/i,
  /Clerk.*development/i,
  /PostHog.*opt-out/i,
];

interface MonitorState {
  entries: ConsoleEntry[];
  file: string;
  attached: boolean;
}

const states = new WeakMap<Page, MonitorState>();

export function attachConsoleMonitor(page: Page, testInfo: TestInfo) {
  const file = path.join(testInfo.outputDir, "console.json");
  const state: MonitorState = { entries: [], file, attached: false };
  states.set(page, state);

  const persist = () => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state.entries, null, 2));
      if (!state.attached) {
        state.attached = true;
        void testInfo.attach("console-log", {
          path: file,
          contentType: "application/json",
        });
      }
    } catch (err) {
      console.warn(`[consoleMonitor] failed to write log: ${err}`);
    }
  };
  persist();

  page.on("console", (msg) => {
    state.entries.push({
      kind: "console",
      type: msg.type(),
      text: redactText(msg.text()),
      location: msg.location()?.url ? redactUrl(msg.location().url) : null,
      timestamp: new Date().toISOString(),
    });
    persist();
  });

  page.on("pageerror", (err) => {
    state.entries.push({
      kind: "pageerror",
      type: "error",
      text: redactText(String(err?.message ?? err)),
      location: redactText((err?.stack ?? "").split("\n")[1]?.trim() ?? '') || null,
      timestamp: new Date().toISOString(),
    });
    persist();
  });

  page.on("crash", () => {
    state.entries.push({
      kind: "crash",
      type: "error",
      text: "Page crashed",
      location: null,
      timestamp: new Date().toISOString(),
    });
    persist();
  });

  return { getConsoleErrors: () => getConsoleErrors(page) };
}

/** Errors + pageerrors + crashes, minus KNOWN_WARNINGS allow-list. */
export function getConsoleErrors(page: Page): ConsoleEntry[] {
  const state = states.get(page);
  if (!state) return [];
  return state.entries.filter((e) => {
    const isError =
      e.kind !== "console" || e.type === "error";
    if (!isError) return false;
    return !KNOWN_WARNINGS.some((re) => re.test(e.text));
  });
}
