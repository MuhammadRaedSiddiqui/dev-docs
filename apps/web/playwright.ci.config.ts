import { defineConfig, devices } from "@playwright/test";

/** Deterministic PR suite: first-party network calls are mocked by each spec. */
export default defineConfig({
  testDir: "./e2e/deterministic",
  globalSetup: './e2e/scripts/warmup.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/results.json" }]],
  expect: { timeout: 10_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 300_000,
    env: { PLAYWRIGHT: "1", NEXT_PUBLIC_API_URL: "http://localhost:4000" },
  },
});
