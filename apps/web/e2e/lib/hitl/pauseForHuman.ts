// apps/web/e2e/lib/hitl/pauseForHuman.ts
// Core HITL primitive: screenshot → notify → block until resumed.
// LOCAL (no CI env var): formatted terminal prompt, readline on stdin.
// CI: webhook notify + resumeServer POST /resume/:token.
// Bounded timeout always; on timeout throws HITLTimeoutError.
import type { Page, TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { notifyTerminal, notifyWebhook } from "./notifiers";
import { resumeUrlFor, waitForResume } from "./resumeServer";

export class HITLTimeoutError extends Error {
  constructor(
    public reason: string,
    public elapsedMs: number,
  ) {
    super(`HITL pause timed out after ${Math.round(elapsedMs / 1000)}s: ${reason}`);
    this.name = "HITLTimeoutError";
  }
}

export class HITLSkipError extends Error {
  constructor(public reason: string) {
    super(`HITL pause skipped by operator: ${reason}`);
    this.name = "HITLSkipError";
  }
}

export interface PauseForHumanOptions {
  reason: string;
  page: Page;
  testInfo: TestInfo;
  /** Default 5 minutes. Never Infinity. */
  timeoutMs?: number;
  screenshotOnPause?: boolean;
  /** Resume after a verifiable human action when worker stdin is not attached. */
  resumeWhen?: () => Promise<boolean>;
}

function appendHitlLog(testInfo: TestInfo, event: Record<string, unknown>) {
  try {
    const file = path.join(testInfo.outputDir, "hitl-log.json");
    let existing: Record<string, unknown>[] = [];
    if (fs.existsSync(file)) {
      try {
        existing = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }
    existing.push({ timestamp: new Date().toISOString(), ...event });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(existing, null, 2));
    void testInfo.attach("hitl-log", { path: file, contentType: "application/json" });
  } catch (err) {
    console.warn(`[hitl] failed to write hitl-log: ${err}`);
  }
}

function waitForEnter(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function pauseForHuman(opts: PauseForHumanOptions): Promise<void> {
  const { reason, page, testInfo } = opts;
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  const screenshotOnPause = opts.screenshotOnPause ?? true;
  const startedAt = Date.now();
  const token = randomUUID();
  const isCI = !!process.env.CI;

  appendHitlLog(testInfo, { event: "pause_start", reason, mode: isCI ? "ci" : "local" });

  // 1. Screenshot current state, attach to the report.
  let screenshotPath: string | undefined;
  if (screenshotOnPause) {
    try {
      screenshotPath = path.join(testInfo.outputDir, `hitl-pause-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await testInfo.attach("hitl-pause-screenshot", {
        path: screenshotPath,
        contentType: "image/png",
      });
    } catch (err) {
      console.warn(`[hitl] pause screenshot failed: ${err}`);
    }
  }

  const notification = {
    testTitle: testInfo.title,
    reason,
    screenshotPath,
    resumeToken: token,
    resumeUrl: isCI ? resumeUrlFor(token) : undefined,
  };

  if (!isCI) {
    // 3a. LOCAL — terminal block, block on stdin.
    await notifyTerminal().notify(notification);
    let stopped = false;
    const automaticResume = opts.resumeWhen ? (async () => {
      while (!stopped) {
        try { if (await opts.resumeWhen!()) return "resume"; } catch {}
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return "__timeout__";
    })() : new Promise<string>(() => {});
    const result = await Promise.race([
      waitForEnter(),
      automaticResume,
      new Promise<string>((resolve) => {
        const t = setTimeout(() => resolve("__timeout__"), timeoutMs);
        t.unref?.();
      }),
    ]);
    stopped = true;
    const elapsed = Date.now() - startedAt;
    if (result === "__timeout__") {
      try {
        const shot = path.join(testInfo.outputDir, "hitl-timeout.png");
        await page.screenshot({ path: shot });
        await testInfo.attach("hitl-timeout-screenshot", { path: shot, contentType: "image/png" });
      } catch {}
      appendHitlLog(testInfo, { event: "timeout", reason, elapsedMs: elapsed });
      throw new HITLTimeoutError(reason, elapsed);
    }
    if (String(result).toUpperCase() === "SKIP") {
      appendHitlLog(testInfo, { event: "skip", reason, elapsedMs: elapsed });
      testInfo.skip(true, `Skipped by operator at HITL pause: ${reason}`);
      throw new HITLSkipError(reason);
    }
    appendHitlLog(testInfo, { event: "resume", reason, elapsedMs: elapsed });
    return;
  }

  // 3b. CI — webhook notify (never crashes the pause), then await resume POST.
  await notifyWebhook().notify(notification);
  console.log(
    `[hitl] paused in CI — POST ${notification.resumeUrl} with ` +
      `Authorization: Bearer <HITL_RESUME_SECRET> to resume, or {"action":"skip"} to skip.`,
  );
  const action = await waitForResume(token, timeoutMs);
  const elapsed = Date.now() - startedAt;
  if (action === "__timeout__") {
    try {
      const shot = path.join(testInfo.outputDir, "hitl-timeout.png");
      await page.screenshot({ path: shot });
      await testInfo.attach("hitl-timeout-screenshot", { path: shot, contentType: "image/png" });
    } catch {}
    appendHitlLog(testInfo, { event: "timeout", reason, elapsedMs: elapsed });
    throw new HITLTimeoutError(reason, elapsed);
  }
  if (action === "skip") {
    appendHitlLog(testInfo, { event: "skip", reason, elapsedMs: elapsed });
    testInfo.skip(true, `Skipped by operator at HITL pause: ${reason}`);
    throw new HITLSkipError(reason);
  }
  appendHitlLog(testInfo, { event: "resume", reason, elapsedMs: elapsed });
}
