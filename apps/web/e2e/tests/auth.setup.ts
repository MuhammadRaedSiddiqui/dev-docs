// apps/web/e2e/tests/auth.setup.ts
// Session persistence (§9.4): reuses storage-state/user.json when valid,
// otherwise drives the real Clerk login flow and pauses for the manual step
// (password / CAPTCHA / 2FA), then saves storageState for every other spec.
import type { Browser } from "@playwright/test";
import { test as setup, expect } from "../lib/fixtures";
import * as fs from "node:fs";
import * as path from "node:path";
import { pauseForHuman } from "../lib/hitl/pauseForHuman";

const STATE_FILE = path.join(__dirname, "..", "storage-state", "user.json");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

async function hasValidState(browser: Browser): Promise<boolean> {
  try {
    if (!fs.existsSync(STATE_FILE)) return false;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    const cookies = raw.cookies ?? [];
    if (!cookies.some((c: { name?: string; expires?: number }) =>
      c.name === '__session' && (c.expires === -1 || (c.expires ?? 0) > Date.now() / 1000),
    )) return false;
    const context = await browser.newContext({ storageState: STATE_FILE });
    try {
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: /New project/i }).first()).toBeVisible({ timeout: 15_000 });
      return new URL(page.url()).pathname === '/dashboard';
    } finally { await context.close(); }
  } catch {
    return false;
  }
}

setup("authenticate", async ({ page, browser }, testInfo) => {
  testInfo.setTimeout(10 * 60_000); // HITL pauses need headroom beyond the 60s default.
  if (await hasValidState(browser)) {
    console.log("[auth.setup] valid storage state found — skipping login.");
    return;
  }
  if (process.env.CI) throw new Error('The dedicated E2E account session is missing or expired. Refresh E2E_STORAGE_STATE_BASE64 before running live tests.');

  // Drive the actual login page identified in Step 0 (Clerk catch-all).
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('.cl-signIn-root')).toBeVisible({ timeout: 60_000 });

  // Pause at the exact manual step — operator completes login/CAPTCHA/2FA,
  // then presses ENTER (local) or POSTs /resume/:token (CI).
  await pauseForHuman({
    reason: "Complete login / CAPTCHA / 2FA in the headed browser; the authenticated dashboard resumes automatically",
    page,
    testInfo,
    timeoutMs: 10 * 60_000,
    resumeWhen: async () => new URL(page.url()).pathname === '/dashboard' &&
      await page.getByRole('button', { name: /New project/i }).first().isVisible(),
  });

  // Verify we landed somewhere authenticated before saving state.
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/sign-in|sign-up|login/);
  await expect(page.getByRole('button', { name: /New project/i }).first()).toBeVisible();

  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  await page.context().storageState({ path: STATE_FILE });
  console.log(`[auth.setup] saved storage state to ${STATE_FILE}`);
});
