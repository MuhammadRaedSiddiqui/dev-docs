// apps/web/e2e/lib/triage/classifyFailure.ts
// Deterministic, offline failure classifier. Runs in the `page` fixture
// teardown (§fixtures) so it always runs on failure — never opt-in per spec.
// Optional Claude enrichment behind ENABLE_AI_TRIAGE=true (never fails the test).
import type { TestInfo } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

export type TriageCategory =
  | "likely_app_bug"
  | "likely_contract_break"
  | "likely_selector_drift"
  | "likely_flaky"
  | "likely_environment"
  | "unclassified";

export interface TriageResult {
  category: TriageCategory;
  confidence: "high" | "medium" | "low";
  evidence: string[];
  summary: string;
  aiOpinion?: string;
}

function readJson(dir: string, name: string): unknown | null {
  try {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function classifyFailure(testInfo: TestInfo): Promise<TriageResult> {
  const dir = testInfo.outputDir;
  const evidence: string[] = [];

  const network = readJson(dir, "network.json") as {
    entries?: { status: number | null; url: string; failureText?: string }[];
    contractViolations?: unknown[];
  } | null;
  const consoleLog = readJson(dir, "console.json") as
    | { kind: string; type: string; text: string }[]
    | null;
  const healed = readJson(dir, "healed-selectors.json") as
    | { description: string; matchedSelector: string }[]
    | null;

  const errorText = String(
    (testInfo as unknown as { error?: { message?: string } }).error?.message ?? "",
  );

  const firstPartyFailures =
    network?.entries?.filter(
      (e) =>
        (e.status !== null && e.status >= 400 && e.status <= 599) ||
        (e.status === null && !!e.failureText),
    ) ?? [];
  const violations = network?.contractViolations ?? [];
  const pageErrors =
    consoleLog?.filter((e) => e.kind === "pageerror" || e.kind === "crash") ?? [];

  if (firstPartyFailures.length > 0) {
    for (const f of firstPartyFailures.slice(0, 3)) {
      evidence.push(`HTTP ${f.status ?? "requestfailed"} on ${f.url}`);
    }
  }
  if (violations.length > 0) evidence.push(`${violations.length} contract violation(s)`);
  if (pageErrors.length > 0) evidence.push(`${pageErrors.length} page error(s)/crash(es)`);
  if (healed && healed.length > 0) evidence.push(`${healed.length} healed selector(s)`);

  const envSignals = [
    /connection refused/i,
    /ERR_CONNECTION/i,
    /ENOTFOUND/i,
    /EAI_AGAIN/i,
    /DNS/i,
    /net::ERR_/i,
    /BASE_URL/i,
    /Timeout.*waiting for.*webServer/i,
  ];
  const selectorSignals = [/waiting for/i, /locator/i, /timeout.*exceed/i, /strict mode/i, /resolved to 0/i];

  let result: TriageResult;

  // Priority order: contract break and app bug outrank flaky/unclassified.
  if (violations.length > 0) {
    result = {
      category: "likely_contract_break",
      confidence: "high",
      evidence,
      summary: `API response failed schema validation (${violations.length} violation(s)).`,
    };
  } else if (firstPartyFailures.some((e) => e.status !== null && e.status >= 400)) {
    result = {
      category: "likely_app_bug",
      confidence: "high",
      evidence,
      summary: `First-party API returned ${firstPartyFailures[0]?.status} — likely app bug.`,
    };
  } else if (
    selectorSignals.some((re) => re.test(errorText)) &&
    (!healed || healed.length === 0)
  ) {
    result = {
      category: "likely_selector_drift",
      confidence: "medium",
      evidence: [...evidence, `error: ${errorText.slice(0, 200)}`],
      summary: "Locator/timeout error with no successful fallback — likely selector drift.",
    };
  } else if (envSignals.some((re) => re.test(errorText))) {
    result = {
      category: "likely_environment",
      confidence: "high",
      evidence: [...evidence, `error: ${errorText.slice(0, 200)}`],
      summary: "Connection/DNS failure — BASE_URL or test environment unreachable.",
    };
  } else if (testInfo.retry > 0 && testInfo.status === testInfo.expectedStatus) {
    result = {
      category: "likely_flaky",
      confidence: "medium",
      evidence,
      summary: "Passed on retry with no correlated failure signal.",
    };
  } else if (pageErrors.length > 0 && firstPartyFailures.length === 0 && violations.length === 0) {
    result = {
      category: "likely_flaky",
      confidence: "low",
      evidence,
      summary: "No network/contract signal; page errors only — possibly flaky.",
    };
  } else {
    result = {
      category: "unclassified",
      confidence: "low",
      evidence: evidence.length > 0 ? evidence : [`error: ${errorText.slice(0, 200) || "unknown"}`],
      summary: "No correlated signal found.",
    };
  }

  // Optional AI escalation — off by default, never fails the test.
  if (
    process.env.ENABLE_AI_TRIAGE === "true" &&
    (result.category === "unclassified" || result.confidence === "low")
  ) {
    try {
      result.aiOpinion = await aiTriage(result, errorText, evidence);
    } catch (err) {
      console.warn(`[triage] AI enrichment failed, continuing: ${err}`);
    }
  }

  try {
    const file = path.join(dir, "triage.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
    await testInfo.attach("triage", { path: file, contentType: "application/json" });
  } catch (err) {
    console.warn(`[triage] failed to write triage.json: ${err}`);
  }
  return result;
}

async function aiTriage(
  result: TriageResult,
  errorText: string,
  evidence: string[],
): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content:
          `A Playwright test failed. Category: ${result.category} (${result.confidence} confidence). ` +
          `Evidence: ${evidence.join("; ") || "none"}. ` +
          `Error: ${errorText.slice(0, 1500) || "unknown"}. ` +
          `In one paragraph, what is the likely root cause and what should the developer check first?`,
      },
    ],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text : "No opinion returned.";
}
