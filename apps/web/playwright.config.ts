// apps/web/playwright.config.ts
// HITL E2E framework config (§3): html + list + json reporters, video on,
// trace on failure, BASE_URL from env, auth-setup project with storage state,
// drafts excluded until a human promotes them.
import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "node:path";

dotenv.config({ path: path.join(__dirname, "e2e", ".env") });

// Local dev server URL/port from this package's own `dev` script:
//   apps/web/package.json → "dev": "next dev --port 3000"
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WORKERS = process.env.WORKERS ? Number(process.env.WORKERS) : undefined;

export default defineConfig({
  // New HITL framework lives here. Legacy mock specs under tests/e2e/
  // are superseded — see e2e/README.md.
  testDir: "./e2e/tests",
  testIgnore: ["**/drafts/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: WORKERS ?? (process.env.CI ? 1 : undefined),
  timeout: 60_000,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    ["json", { outputFile: "test-results/results.json" }],
  ],

  use: {
    baseURL: BASE_URL,
    video: "on",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Live tests always use real Clerk authentication. Only the separate
    // deterministic development server enables the mock identity.
  },

  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/storage-state/user.json",
      },
    },
    // Uncomment to add browsers:
    // { name: "firefox", dependencies: ["auth-setup"], use: { ...devices["Desktop Firefox"], storageState: "e2e/storage-state/user.json" } },
    // { name: "webkit", dependencies: ["auth-setup"], use: { ...devices["Desktop Safari"], storageState: "e2e/storage-state/user.json" } },
  ],

  webServer: process.env.SKIP_WEBSERVER === "1" ? undefined : {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { PLAYWRIGHT: "0" },
  },
});
