// apps/web/e2e/tests/auth.setup.ts
// Session persistence (§9.4): reuses storage-state/user.json when valid,
// otherwise drives the real Clerk login flow and pauses for the manual step
// (password / CAPTCHA / 2FA), then saves storageState for every other spec.
import { test as setup, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { pauseForHuman } from "../lib/hitl/pauseForHuman";

const STATE_FILE = path.join(__dirname, "..", "storage-state", "user.json");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function hasValidState(): Promise<boolean> {
  try {
    if (!fs.existsSync(STATE_FILE)) return false;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    const cookies = raw.cookies ?? [];
    // Any session/auth cookie from Clerk or the app counts as a saved session.
    return cookies.some((c: { name?: string }) =>
      /__session|__client|auth|session/i.test(c.name ?? ""),
    );
  } catch {
    return false;
  }
}

setup("authenticate", async ({ page }, testInfo) => {
  testInfo.setTimeout(10 * 60_000); // HITL pauses need headroom beyond the 60s default.
  if (await hasValidState()) {
    console.log("[auth.setup] valid storage state found — skipping login.");
    return;
  }

  // Drive the actual login page identified in Step 0 (Clerk catch-all).
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: "domcontentloaded" });

  // Pause at the exact manual step — operator completes login/CAPTCHA/2FA,
  // then presses ENTER (local) or POSTs /resume/:token (CI).
  await pauseForHuman({
    reason: "Complete login / CAPTCHA / 2FA in the headed browser, then resume",
    page,
    testInfo,
    timeoutMs: 10 * 60_000,
  });

  // Verify we landed somewhere authenticated before saving state.
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/sign-in|sign-up|login/);

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  await page.context().storageState({ path: STATE_FILE });
  console.log(`[auth.setup] saved storage state to ${STATE_FILE}`);
});
