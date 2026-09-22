// apps/web/e2e/lib/reporting/agentFeedback.ts
// Builds test-results/agent-feedback.json — one trimmed entry per failed test,
// small enough to hand directly to an AI coding session.
import * as fs from "node:fs";
import * as path from "node:path";

export interface AgentFeedbackEntry {
  testTitle: string;
  filePath: string;
  triage: { category: string; summary: string } | null;
  assertionError: string | null;
  relevantNetworkExcerpt: unknown[];
  relevantConsoleExcerpt: unknown[];
  healedSelectors: unknown[];
  screenshotPath: string | null;
  videoPath: string | null;
}

function relToResults(p: string | null, resultsDir: string): string | null {
  return p ? path.relative(resultsDir, p).replace(/\\/g, "/") : null;
}

export function buildAgentFeedback(resultsDir: string): AgentFeedbackEntry[] {
  const entries: AgentFeedbackEntry[] = [];
  // Playwright JSON reporter output (see playwright.config.ts json reporter).
  const resultsJson = path.join(resultsDir, "results.json");
  if (!fs.existsSync(resultsJson)) {
    console.warn(`[agentFeedback] ${resultsJson} not found — run tests first.`);
    return entries;
  }
  const report = JSON.parse(fs.readFileSync(resultsJson, "utf8"));

  const visit = (suite: { suites?: unknown[]; specs?: unknown[] }) => {
    for (const s of (suite.suites ?? []) as typeof suite[]) visit(s);
    for (const spec of (suite.specs ?? []) as {
      title: string;
      file: string;
      tests: {
        results: {
          status: string;
          error?: { message?: string };
          attachments?: { name: string; path?: string }[];
        }[];
      }[];
    }[]) {
      for (const t of spec.tests) {
        for (const r of t.results) {
          if (r.status === "passed" || r.status === "skipped") continue;
          // Each retry writes to its own output dir; find the attachment dirs.
          const attachments = r.attachments ?? [];
          const byName = (n: string) => attachments.find((a) => a.name === n)?.path ?? null;

          // Fall back to scanning the test's output dir siblings when the
          // JSON reporter doesn't embed attachment paths.
          entries.push({
            testTitle: spec.title,
            filePath: path.relative(process.cwd(), spec.file),
            triage: readTriage(byName("triage")),
            assertionError: r.error?.message?.slice(0, 2000) ?? null,
            relevantNetworkExcerpt: readNetworkExcerpt(byName("network-log")),
            relevantConsoleExcerpt: readConsoleExcerpt(byName("console-log")),
            healedSelectors: readJsonAttachment(byName("healed-selectors")),
            screenshotPath: relToResults(byName("screenshot") ?? byName("test-failed-1.png"), resultsDir),
            videoPath: relToResults(byName("video"), resultsDir),
          });
        }
      }
    }
  };
  visit(report);

  const outFile = path.join(resultsDir, "agent-feedback.json");
  fs.writeFileSync(outFile, JSON.stringify(entries, null, 2));
  return entries;
}

function readJsonAttachment(p: string | null | undefined): unknown[] {
  if (!p || !fs.existsSync(p)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function readTriage(p: string | null | undefined): AgentFeedbackEntry["triage"] {
  if (!p || !fs.existsSync(p)) return null;
  try {
    const t = JSON.parse(fs.readFileSync(p, "utf8"));
    return { category: t.category ?? "unclassified", summary: t.summary ?? "" };
  } catch {
    return null;
  }
}

function readNetworkExcerpt(p: string | null | undefined): unknown[] {
  if (!p || !fs.existsSync(p)) return [];
  try {
    const log = JSON.parse(fs.readFileSync(p, "utf8"));
    const entries = log.entries ?? [];
    const violations = log.contractViolations ?? [];
    // Signal only: failed/contract-violating entries, capped.
    const failed = entries.filter(
      (e: { failed?: boolean; status?: number | null }) =>
        e.failed || (e.status !== null && e.status !== undefined && (e.status < 200 || e.status >= 400)),
    );
    return [...failed.slice(0, 20), ...violations.slice(0, 10).map((v: unknown) => ({ contractViolation: v }))];
  } catch {
    return [];
  }
}

function readConsoleExcerpt(p: string | null | undefined): unknown[] {
  if (!p || !fs.existsSync(p)) return [];
  try {
    const entries = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(
        (e: { kind?: string; type?: string }) =>
          e.kind !== "console" || e.type === "error",
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}
