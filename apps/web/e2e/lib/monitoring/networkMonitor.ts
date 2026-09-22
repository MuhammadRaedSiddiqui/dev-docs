// apps/web/e2e/lib/monitoring/networkMonitor.ts
// Per-test HTTP log + opt-in JSON-Schema contract validation.
// Contract checking only applies to URLs matching a provided pattern —
// unmatched URLs are logged but never fail.
import type { Page, TestInfo } from "@playwright/test";
import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import * as fs from "node:fs";
import * as path from "node:path";

export interface ContractEntry {
  urlPattern: RegExp;
  schemaPath: string;
}

export interface NetworkEntry {
  method: string;
  url: string;
  resourceType: string;
  status: number | null;
  timingMs: number | null;
  responseSize: number | null;
  failed: boolean;
  failureText?: string;
  timestamp: string;
}

export interface ContractViolation {
  url: string;
  schemaPath: string;
  errors: ErrorObject[] | string;
  timestamp: string;
}

/** Beacons and third-party noise that should never fail a test. */
export const IGNORE_PATTERNS: RegExp[] = [
  /posthog/i,
  /sentry/i,
  /analytics/i,
  /clerk.*\/v1\/.*telemetry/i,
  /favicon\.ico$/,
];

interface MonitorState {
  entries: NetworkEntry[];
  violations: ContractViolation[];
  validators: { pattern: RegExp; schemaPath: string; validate: (d: unknown) => boolean; errors: () => ErrorObject[] | null | undefined }[];
  file: string;
  attached: boolean;
}

const states = new WeakMap<Page, MonitorState>();

function shouldIgnore(url: string): boolean {
  return IGNORE_PATTERNS.some((re) => re.test(url));
}

function writeLog(testInfo: TestInfo, state: MonitorState) {
  try {
    fs.mkdirSync(path.dirname(state.file), { recursive: true });
    fs.writeFileSync(
      state.file,
      JSON.stringify(
        { entries: state.entries, contractViolations: state.violations },
        null,
        2,
      ),
    );
    if (!state.attached) {
      state.attached = true;
      void testInfo.attach("network-log", {
        path: state.file,
        contentType: "application/json",
      });
    }
  } catch (err) {
    console.warn(`[networkMonitor] failed to write log: ${err}`);
  }
}

export function attachNetworkMonitor(
  page: Page,
  testInfo: TestInfo,
  contracts: ContractEntry[] = [],
) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validators = contracts.map((c) => {
    const absolute = path.isAbsolute(c.schemaPath)
      ? c.schemaPath
      : path.join(process.cwd(), c.schemaPath);
    const schema = JSON.parse(fs.readFileSync(absolute, "utf8"));
    const validate = ajv.compile(schema);
    return {
      pattern: c.urlPattern,
      schemaPath: c.schemaPath,
      validate: (d: unknown) => validate(d) as boolean,
      errors: () => validate.errors,
    };
  });

  const file = path.join(testInfo.outputDir, "network.json");
  const state: MonitorState = { entries: [], violations: [], validators, file, attached: false };
  states.set(page, state);
  const startTimes = new Map<string, number>();

  const persist = () => writeLog(testInfo, state);
  // Ensure the file exists even if no requests fire.
  persist();

  page.on("request", (req) => {
    if (shouldIgnore(req.url())) return;
    startTimes.set(req.url() + "|" + Date.now().toString(), Date.now());
    // Store start keyed by request object identity via a simple map.
    (req as unknown as { __t0?: number }).__t0 = Date.now();
  });

  page.on("response", async (res) => {
    const req = res.request();
    const url = req.url();
    if (shouldIgnore(url)) return;
    const t0 = (req as unknown as { __t0?: number }).__t0;
    const timingMs = typeof t0 === "number" ? Date.now() - t0 : null;
    let responseSize: number | null = null;
    try {
      const headers: Record<string, string> = await res.allHeaders();
      const len = headers["content-length"];
      if (len) responseSize = Number(len);
    } catch {
      responseSize = null;
    }
    const entry: NetworkEntry = {
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      status: res.status(),
      timingMs,
      responseSize,
      failed: res.status() < 200 || res.status() >= 400,
      timestamp: new Date().toISOString(),
    };
    state.entries.push(entry);

    // Opt-in contract validation.
    for (const v of state.validators) {
      if (!v.pattern.test(url)) continue;
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        continue; // Skips gracefully if not JSON.
      }
      let ok = false;
      try {
        ok = v.validate(body);
      } catch (err) {
        state.violations.push({
          url,
          schemaPath: v.schemaPath,
          errors: String(err),
          timestamp: new Date().toISOString(),
        });
        continue;
      }
      if (!ok) {
        state.violations.push({
          url,
          schemaPath: v.schemaPath,
          errors: v.errors() ?? [],
          timestamp: new Date().toISOString(),
        });
      }
    }
    persist();
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (shouldIgnore(url)) return;
    const t0 = (req as unknown as { __t0?: number }).__t0;
    state.entries.push({
      method: req.method(),
      url,
      resourceType: req.resourceType(),
      status: null,
      timingMs: typeof t0 === "number" ? Date.now() - t0 : null,
      responseSize: null,
      failed: true,
      failureText: req.failure()?.errorText ?? "requestfailed",
      timestamp: new Date().toISOString(),
    });
    persist();
  });

  return {
    getFailedRequests: () => getFailedRequests(page),
    getContractViolations: () => getContractViolations(page),
  };
}

export function getFailedRequests(page: Page): NetworkEntry[] {
  const state = states.get(page);
  if (!state) return [];
  // Only first-party failures count — third-party noise is already filtered.
  return state.entries.filter((e) => e.failed);
}

export function getContractViolations(page: Page): ContractViolation[] {
  return states.get(page)?.violations ?? [];
}
