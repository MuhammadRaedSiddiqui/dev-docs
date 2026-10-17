import { defineConfig } from '@playwright/test';
import base from './playwright.ci.config';
const server = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer;

/** Focused interview checks avoid recording video for every state transition. */
export default defineConfig({
  ...base,
  testMatch: 'interview.spec.ts',
  globalSetup: undefined,
  reporter: [['list'], ['json', { outputFile: 'test-results/interview-focused.json' }]],
  outputDir: 'test-results/interview-focused',
  use: { ...base.use, video: 'off', trace: 'off' },
  webServer: {
    ...server,
    command: 'pnpm dev',
    url: 'http://localhost:3000/project/00000000-0000-4000-a000-000000000001/interview',
  },
});
