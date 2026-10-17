import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardLiveBudget } from '../../../web/e2e/lib/live-budget';

const directories: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true }); });
function ledger() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devdocs-budget-test-')); directories.push(dir);
  const file = path.join(dir, 'spend.json'); vi.stubEnv('E2E_SPEND_LEDGER', file); return file;
}
async function harness(limit: number, max: number) {
  let handler: any;
  const page = { route: vi.fn(async (_pattern, fn) => { handler = fn; }) };
  const info = { title: 'budget regression', attach: vi.fn(async () => {}) };
  const snapshot = await guardLiveBudget(page as any, info as any, limit, max);
  const route = { request: () => ({ postDataJSON: () => ({ provider: 'metamuse', projectId: 'test', domainId: 'planning' }), postData: () => '{}' }),
    continue: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
  return { handler, route, snapshot };
}
describe('durable live provider spending guard', () => {
  it('writes reservations before forwarding, and carries spend into later attempts', async () => {
    const file = ledger(); const first = await harness(8.23, 30);
    first.route.continue.mockImplementation(async () => { expect(JSON.parse(fs.readFileSync(file, 'utf8')).attempts).toHaveLength(1); });
    await first.handler(first.route);
    const second = await harness(8.23, 30); await second.handler(second.route);
    expect(second.snapshot().newReservationUsd).toBeCloseTo(first.snapshot().newReservationUsd * 2);
    expect(second.snapshot().cumulativeReservationUsd).toBeCloseTo(1.76834625 + second.snapshot().newReservationUsd);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).attempts.every((a: any) => a.sdkAttemptsReserved === 3)).toBe(true);
  });
  it('blocks before forwarding when cumulative allowance would be exceeded', async () => {
    const file = ledger(); const initial = await harness(0.2, 30); await initial.handler(initial.route);
    const next = await harness(0.2, 30);
    await expect(next.handler(next.route)).rejects.toThrow('budget reached');
    expect(next.route.continue).not.toHaveBeenCalled(); expect(next.route.abort).toHaveBeenCalledOnce();
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).attempts).toHaveLength(1);
  });
  it('retains the per-run request guard and refuses an unconfigured full interview', async () => {
    ledger(); const run = await harness(8.23, 1); await run.handler(run.route);
    await expect(run.handler(run.route)).rejects.toThrow('budget reached');
    vi.stubEnv('E2E_SPEND_LEDGER', '');
    await expect(harness(8.23, 30)).rejects.toThrow('require E2E_SPEND_LEDGER');
  });
});
