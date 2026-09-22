// apps/web/e2e/scripts/generate-agent-report.ts
// Post-run reporter: `pnpm --filter @devdocs/web report:agent`.
// Prints a clean Markdown digest of test-results/agent-feedback.json.
// (Chosen over globalTeardown so the digest also works when tests were run
//  elsewhere — e.g. CI artifacts downloaded locally — without re-running.)
import * as fs from "node:fs";
import * as path from "node:path";
import { buildAgentFeedback } from "../lib/reporting/agentFeedback";

const RESULTS_DIR = path.join(process.cwd(), "test-results");

function main() {
  if (!fs.existsSync(path.join(RESULTS_DIR, "results.json"))) {
    console.log(
      "No test-results/results.json found. Run `npx playwright test` first (json reporter enabled in playwright.config.ts).",
    );
    process.exit(1);
  }
  const entries = buildAgentFeedback(RESULTS_DIR);
  if (entries.length === 0) {
    console.log("✅ No failed tests — nothing to report.");
    return;
  }
  console.log(`# Agent failure digest — ${entries.length} failed test(s)\n`);
  for (const e of entries) {
    console.log(`## ${e.testTitle}`);
    console.log(`- File: \`${e.filePath}\``);
    console.log(`- Triage: \`${e.triage?.category ?? "n/a"}\` — ${e.triage?.summary ?? "no triage"}`);
    if (e.assertionError) {
      console.log(`- Error: ${e.assertionError.split("\n")[0]}`);
    }
    if (e.relevantNetworkExcerpt.length > 0) {
      console.log(`- Network signal: ${JSON.stringify(e.relevantNetworkExcerpt.slice(0, 3))}`);
    }
    if (e.relevantConsoleExcerpt.length > 0) {
      console.log(`- Console signal: ${JSON.stringify(e.relevantConsoleExcerpt.slice(0, 3))}`);
    }
    if (e.healedSelectors.length > 0) {
      console.log(`- Healed selectors: review primaries (${JSON.stringify(e.healedSelectors).slice(0, 300)})`);
    }
    if (e.screenshotPath) console.log(`- Screenshot: ${e.screenshotPath}`);
    if (e.videoPath) console.log(`- Video: ${e.videoPath}`);
    console.log("");
  }
  console.log(`Full detail: ${path.join("test-results", "agent-feedback.json")}`);
}

main();
