// apps/web/e2e/scripts/ai-generate-test.ts
// AI-assisted scaffolding: `pnpm --filter @devdocs/web test:ai -- "test the X flow: step 1, ..."`
// Writes to e2e/tests/drafts/<slug>.spec.ts ONLY — never into e2e/tests/.
// Fails loudly when ANTHROPIC_API_KEY is missing.
import * as fs from "node:fs";
import * as path from "node:path";

const SCAN_PATHS = (process.env.AI_SCAFFOLD_SCAN_PATHS ??
  "app/(app)/dashboard,app/(app)/project,app/(app)/settings,components/interview,components/dashboard,lib/interview")
  .split(",")
  .map((s) => s.trim());

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "draft-spec"
  );
}

function readPrd(): string {
  for (const candidate of ["PRD.md", "apps/web/PRD.md"]) {
    const full = path.join(process.cwd(), candidate);
    if (fs.existsSync(full)) return fs.readFileSync(full, "utf8").slice(0, 4000);
  }
  return "(no PRD.md at repo root)";
}

function shallowScan(): string {
  const webRoot = process.cwd(); // runs from apps/web
  const out: string[] = [];
  for (const rel of SCAN_PATHS) {
    const full = path.join(webRoot, rel);
    try {
      const entries = fs.readdirSync(full, { withFileTypes: true });
      out.push(`## ${rel}/\n` + entries.map((e) => `- ${e.name}${e.isDirectory() ? "/" : ""}`).join("\n"));
    } catch {
      out.push(`## ${rel}/ (not found)`);
    }
  }
  return out.join("\n\n").slice(0, 6000);
}

function pageObjectIndex(): string {
  const dir = path.join(process.cwd(), "e2e", "lib", "pages");
  try {
    return fs.readdirSync(dir).join(", ");
  } catch {
    return "(no page objects yet)";
  }
}

async function main() {
  const description = process.argv.slice(2).join(" ").trim();
  if (!description) {
    console.error('Usage: pnpm test:ai -- "test the <flow>: step 1, step 2, step 3"');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — cannot scaffold. Export it and retry.");
    process.exit(1);
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system =
    `You generate Playwright specs for the DevDocs AI repo (Next.js 14 + Clerk + tRPC + Zustand interview). ` +
    `Rules: import { test, expect } from "../lib/fixtures" (NEVER from @playwright/test directly); ` +
    `prefer existing Page Object methods from e2e/lib/pages/ (${pageObjectIndex()}) where they cover the flow, ` +
    `and note where a new Page Object method may be needed; use the find() fixture (resilientLocator) ` +
    `for any new interactive elements with real primary + fallback selectors; ` +
    `call await hitl('...') at any step plausibly needing auth/CAPTCHA/manual input; ` +
    `add test.use({ storageState: "e2e/storage-state/user.json" }); ` +
    `output ONLY the spec file contents, no markdown fences.`;

  const user =
    `Flow to test: ${description}\n\nPRD:\n${readPrd()}\n\nRepo scan:\n${shallowScan()}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content[0];
  const code = block.type === "text" ? block.text : "";
  if (!code.trim()) {
    console.error("Claude returned no content — retry.");
    process.exit(1);
  }

  const slug = slugify(description);
  const outFile = path.join(process.cwd(), "e2e", "tests", "drafts", `${slug}.spec.ts`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, code.replace(/^```ts\n?|```$/g, ""));
  console.log(`✅ Draft written to e2e/tests/drafts/${slug}.spec.ts`);
  console.log("It needs human review before promotion: move it to e2e/tests/ once reviewed.");
}

void main();
