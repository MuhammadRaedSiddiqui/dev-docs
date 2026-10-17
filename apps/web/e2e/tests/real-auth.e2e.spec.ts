// Targeted real Clerk/API/PostgreSQL coverage. Authentication is never mocked.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { test, expect } from '../lib/fixtures';
import { AuthenticationPage } from '../lib/pages/AuthenticationPage';
import { attachNetworkMonitor, flushNetworkMonitor } from '../lib/monitoring/networkMonitor';
import { attachConsoleMonitor } from '../lib/monitoring/consoleMonitor';

const run = fs.readFileSync(path.resolve('../../.freebuff/auth-testing/current-run.txt'), 'utf8').trim();
const accountFile = path.join(run, 'accounts.json');
const original = path.resolve('e2e/storage-state/user.json');
const originalHash = createHash('sha256').update(fs.readFileSync(original)).digest('hex');
const saved = path.join(run, 'saved-original-copy.json');
if (!fs.existsSync(saved)) fs.copyFileSync(original, saved);
type Account = { clerkId: string; localId: string; createdAt: number; projectId?: string; name?: string; body?: string; sessionId?: string };
type Accounts = { startedAt: string; A?: Account; B?: Account };
if (!fs.existsSync(accountFile)) fs.writeFileSync(accountFile, JSON.stringify({ startedAt: new Date().toISOString() }));
const accounts = (): Accounts => JSON.parse(fs.readFileSync(accountFile, 'utf8'));
const store = (record: Accounts) => fs.writeFileSync(accountFile, JSON.stringify(record, null, 2));
const state = (label: string) => path.join(run, `account-${label}.json`);
function evidence(mode: string, value?: string): any {
  return JSON.parse(execFileSync(process.execPath, [path.resolve('../api/scripts/auth-test-evidence.mjs'), mode, ...(value ? [value] : [])],
    { encoding: 'utf8', windowsHide: true, timeout: 60_000 }));
}
function record(name: string, value: unknown) {
  fs.writeFileSync(path.join(run, `${name}.json`), JSON.stringify(value, null, 2));
}
let paidAttempts = 0;
test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if ((url.port === '4000' && (url.pathname.startsWith('/ai/') || /keys\.upsert/.test(url.pathname)))) {
      paidAttempts++;
      record('provider-guard', { paidRequestsForwarded: 0, blockedAttempts: paidAttempts });
      await route.abort('blockedbyclient');
      throw new Error('Auth-only test attempted a forbidden provider operation');
    }
    await route.continue();
  });
});
test.afterEach(async () => {
  expect(createHash('sha256').update(fs.readFileSync(original)).digest('hex'), 'Original storage state preserved').toBe(originalHash);
  record('provider-guard', { paidRequestsForwarded: 0, blockedAttempts: paidAttempts });
});
async function token(page: Page) {
  await page.waitForFunction(() => !!(window as any).Clerk?.loaded && !!(window as any).Clerk?.session, null, { timeout: 60_000 });
  return page.evaluate(async () => await (window as any).Clerk.session?.getToken({ skipCache: true }) ?? null);
}
function claims(jwt: string) {
  const data = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  return { iat: data.iat as number, exp: data.exp as number, sid: data.sid as string };
}
async function rpc(page: Page, info: TestInfo, procedure: string, input?: unknown, mutation = false, explicitToken?: string | null) {
  const auth = explicitToken === undefined ? await token(page) : explicitToken;
  const response = await fetch('http://localhost:4000/trpc/' + procedure + (!mutation && input !== undefined ? '?input=' + encodeURIComponent(JSON.stringify(input)) : ''), {
    method: mutation ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    ...(mutation ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as any;
  const item = { at: new Date().toISOString(), procedure, method: mutation ? 'POST' : 'GET', status: response.status,
    code: body.error?.data?.code ?? null, requestId: response.headers.get('x-request-id') };
  fs.mkdirSync(info.outputDir, { recursive: true });
  fs.appendFileSync(info.outputPath('api-statuses.jsonl'), JSON.stringify(item) + '\n');
  return { status: response.status, data: body.result?.data, code: item.code };
}
async function shot(page: Page, info: TestInfo, name: string) {
  const file = info.outputPath(name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  await info.attach(name, { path: file, contentType: 'image/png' });
}
async function loadAccount(page: Page, label: 'A' | 'B', info: TestInfo) {
  test.skip(!fs.existsSync(state(label)), `Disposable account ${label} signup is required`);
  await page.context().addCookies(JSON.parse(fs.readFileSync(state(label), 'utf8')).cookies);
  await new AuthenticationPage(page, info).dashboard();
  expect(await page.evaluate(() => (window as any).Clerk.user.id)).toBe(accounts()[label]!.clerkId);
}
function requireBoth() { test.skip(!accounts().A?.projectId || !accounts().B?.projectId, 'Both disposable fixtures are required'); }

test('01 saved session restoration and genuine token expiry/renewal', async ({ browser, page }, info) => {
  await page.context().addCookies(JSON.parse(fs.readFileSync(saved, 'utf8')).cookies);
  const auth = new AuthenticationPage(page, info);
  await auth.dashboard();
  expect((await rpc(page, info, 'projects.list')).status).toBe(200);
  await page.reload();
  await auth.dashboard();
  await auth.goto('/settings');
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  const first = await token(page);
  expect(first).toBeTruthy();
  const before = claims(first!);
  const session = evidence('session', before.sid);
  record('session-lifetime', { tokenIssuedAt: before.iat, tokenExpiresAt: before.exp, tokenLifetimeSeconds: before.exp - before.iat,
    clerkSession: session, distinction: 'JWT expiration is separate from the Clerk session expireAt/abandonAt' });
  const waitMs = Math.max(0, before.exp * 1000 - Date.now() + 7_000);
  test.skip(waitMs > 150_000, 'Natural token lifetime exceeds bounded renewal wait');
  await page.waitForTimeout(waitMs);
  const expired = await rpc(page, info, 'projects.list', undefined, false, first);
  const second = await token(page);
  expect(second).toBeTruthy();
  const after = claims(second!);
  const renewed = await rpc(page, info, 'projects.list', undefined, false, second);
  record('renewal', { before: { iat: before.iat, exp: before.exp }, after: { iat: after.iat, exp: after.exp },
    sameSession: before.sid === after.sid, differentToken: first !== second, expiredTokenStatus: expired.status,
    renewedTokenStatus: renewed.status, wallClockWaitMs: waitMs });
  expect(expired.status).toBe(401);
  expect(after.exp).toBeGreaterThan(before.exp);
  expect(after.sid).toBe(before.sid);
  expect(renewed.status).toBe(200);
  const context = await browser.newContext({ storageState: saved, recordVideo: { dir: info.outputDir } });
  try {
    const restored = await context.newPage();
    attachNetworkMonitor(restored, info); attachConsoleMonitor(restored, info);
    await new AuthenticationPage(restored, info).dashboard();
    expect((await rpc(restored, info, 'projects.list')).status).toBe(200);
    await shot(restored, info, 'restored-dashboard');
    await flushNetworkMonitor(restored, info);
  } finally { await context.close(); }
});

for (const label of ['A', 'B'] as const) test(`02 signup dedicated disposable account ${label} and persist non-AI fixtures`, async ({ page }, info) => {
  const auth = new AuthenticationPage(page, info);
  if (fs.existsSync(state(label))) await loadAccount(page, label, info);
  else await auth.humanAuth(label, true);
  expect((await rpc(page, info, 'projects.list')).status).toBe(200);
  const id = await page.evaluate(() => (window as any).Clerk.user.id);
  const identity = evidence('identity', id);
  const recordData = accounts();
  expect(identity.createdAt, 'Existing accounts must never become deletion fixtures').toBeGreaterThanOrEqual(Date.parse(recordData.startedAt));
  expect(identity.localId).toBeTruthy();
  expect(id).not.toBe(recordData[label === 'A' ? 'B' : 'A']?.clerkId);
  recordData[label] = { ...recordData[label], ...identity };
  store(recordData);
  await page.context().storageState({ path: state(label) });
  if (!recordData[label]!.projectId) {
    const name = `AUTH TEST ${path.basename(run)} ${label} disposable`;
    const created = await rpc(page, info, 'projects.create', { name, type: 'saas' }, true);
    expect(created.status).toBe(200);
    const projectId = created.data.id;
    const body = `# Private auth fixture ${label}\n\nOwned by dedicated account ${label}; no AI generation.`;
    recordData[label] = { ...recordData[label]!, projectId, name, body };
    store(recordData);
    expect((await rpc(page, info, 'documents.update', { projectId, domainId: 'planning', content: body }, true)).status).toBe(200);
    const session = await rpc(page, info, 'sessions.create', { projectId, metadata: { projectType: 'saas', activeDomains: ['planning'],
      teamSize: 'solo', timeline: '1_3_months', budget: 'bootstrapped', experienceLevel: 'intermediate' } }, true);
    expect(session.status).toBe(200);
    recordData[label]!.sessionId = session.data.id; store(recordData);
    expect((await rpc(page, info, 'sessions.logMessage', { sessionId: session.data.id, role: 'user', content: `AUTH TEST ${label} telemetry`, domainId: 'planning',
      provider: null, thinkingDurationMs: null, streamingDurationMs: null, totalDurationMs: null, tokensUsed: null, errorType: null, metadata: null }, true)).status).toBe(200);
  }
  await auth.dashboard();
  await expect(page.getByText(recordData[label]!.name!, { exact: true })).toBeVisible();
  await shot(page, info, `disposable-${label}-dashboard`);
  record(`fixture-${label}`, evidence('snapshot', `fixture-${label}-database`));
});

test('03 reciprocal ownership API and UI isolation with unchanged database records', async ({ browser, page }, info) => {
  requireBoth();
  const before = evidence('snapshot', 'ownership-before');
  for (const [label, other] of [['A', 'B'], ['B', 'A']] as const) {
    const context = await browser.newContext({ storageState: state(label), recordVideo: { dir: info.outputDir } });
    try {
      const tab = await context.newPage();
      attachNetworkMonitor(tab, info); attachConsoleMonitor(tab, info);
      const victim = accounts()[other]!;
      await new AuthenticationPage(tab, info).dashboard();
      const listed = await rpc(tab, info, 'projects.list');
      expect(listed.status).toBe(200);
      expect(listed.data.some((p: any) => p.id === victim.projectId)).toBe(false);
      const docs = await rpc(tab, info, 'documents.list');
      expect(docs.data.some((d: any) => d.projectId === victim.projectId)).toBe(false);
      const exported = await rpc(tab, info, 'account.exportData');
      expect(exported.data.projects.some((p: any) => p.id === victim.projectId)).toBe(false);
      expect(exported.data.documents.some((d: any) => d.projectId === victim.projectId)).toBe(false);
      for (const [procedure, input, mutation] of [
        ['projects.get', { id: victim.projectId }, false],
        ['documents.listByProject', { projectId: victim.projectId }, false],
        ['projects.update', { id: victim.projectId, data: { name: 'FORBIDDEN RENAME' } }, true],
        ['projects.update', { id: victim.projectId, data: { interviewData: { elaboration: 'FORBIDDEN EDIT' } } }, true],
        ['documents.update', { projectId: victim.projectId, domainId: 'planning', content: 'FORBIDDEN DOCUMENT EDIT' }, true],
        ['projects.delete', { id: victim.projectId }, true],
        ['sessions.get', { sessionId: victim.sessionId }, false],
        ['sessions.listByProject', { projectId: victim.projectId }, false],
      ] as [string, unknown, boolean][]) {
        const denied = await rpc(tab, info, procedure, input, mutation);
        expect(denied.status, procedure).toBe(404); expect(denied.code).toBe('NOT_FOUND');
      }
      await new AuthenticationPage(tab, info).ownershipUi(victim.projectId!, victim.name!, victim.body!);
      await shot(tab, info, `ownership-${label}-denied`);
      await flushNetworkMonitor(tab, info);
    } finally { await context.close(); }
  }
  const after = evidence('snapshot', 'ownership-after');
  expect(after.owned).toEqual(before.owned);
  expect(Object.values(after.preexistingUnchanged)).not.toContain(false);
});

test('04 real UI sign-out protects second tab, reload, deep link and Back; reauthentication', async ({ page, context }, info) => {
  requireBoth(); await loadAccount(page, 'A', info);
  const account = accounts().A!;
  const other = await context.newPage(); attachNetworkMonitor(other, info); attachConsoleMonitor(other, info);
  await new AuthenticationPage(other, info).dashboard();
  await expect(other.getByText(account.name!, { exact: true })).toBeVisible();
  await page.goto('http://localhost:3000/docs'); await page.goto('http://localhost:3000/dashboard');
  const auth = new AuthenticationPage(page, info);
  await auth.signOut();
  await auth.expectPrivateAbsent([account.name!]);
  await new AuthenticationPage(other, info).expectPrivateAbsent([account.name!]);
  expect((await rpc(page, info, 'projects.list', undefined, false, null)).status).toBe(401);
  expect((await rpc(other, info, 'documents.list', undefined, false, null)).status).toBe(401);
  await page.reload(); await auth.expectPrivateAbsent([account.name!]);
  const deep = await page.goto(`http://localhost:3000/project/${account.projectId}/interview`);
  record('signout-deep-link', { status: deep?.status(), pathname: new URL(page.url()).pathname });
  await auth.expectPrivateAbsent([account.name!, account.body!]);
  await page.goBack(); await auth.expectPrivateAbsent([account.name!, account.body!]);
  await shot(page, info, 'signout-protected-back');
  await other.reload(); await new AuthenticationPage(other, info).expectPrivateAbsent([account.name!]);
  await auth.humanAuth('A');
  expect(await page.evaluate(() => (window as any).Clerk.user.id)).toBe(account.clerkId);
  expect((await rpc(page, info, 'projects.get', { id: account.projectId })).status).toBe(200);
  await page.context().storageState({ path: state('A') });
  await flushNetworkMonitor(other, info);
});

test('04b saved-account UI sign-out protects second tab, reload, deep link and Back; reauthentication', async ({ page, context }, info) => {
  test.skip(process.env.AUTH_SAVED_SIGNOUT !== '1', 'Explicit standalone saved-account sign-out run only');
  await context.addCookies(JSON.parse(fs.readFileSync(path.join(run, 'saved-reauthenticated.json'), { encoding: 'utf8', flag: 'r' })).cookies);
  const auth = new AuthenticationPage(page, info);
  await auth.dashboard();
  const identity = await page.evaluate(() => (window as any).Clerk.user.id);
  const listed = await rpc(page, info, 'projects.list');
  expect(listed.status).toBe(200);
  expect(listed.data.length).toBeGreaterThan(0);
  const project = listed.data[0];
  const other = await context.newPage(); attachNetworkMonitor(other, info); attachConsoleMonitor(other, info);
  await new AuthenticationPage(other, info).dashboard();
  await expect(other.getByText(project.name, { exact: true })).toBeVisible();
  await page.goto('http://localhost:3000/docs'); await auth.dashboard();
  await auth.signOut();
  // Save failures without cutting off independent boundary and recovery checks.
  const outcomes: Record<string, boolean | number> = {};
  for (const [label, tab] of [['primary', page], ['secondTab', other]] as const) {
    try { await new AuthenticationPage(tab, info).expectPrivateAbsent([project.name]); outcomes[label] = true; }
    catch { outcomes[label] = false; await shot(tab, info, `signout-${label}-private-data`); }
  }
  outcomes.unauthProjectsStatus = (await rpc(page, info, 'projects.list', undefined, false, null)).status;
  outcomes.unauthDocumentsStatus = (await rpc(other, info, 'documents.list', undefined, false, null)).status;
  await page.reload(); await auth.expectPrivateAbsent([project.name]); outcomes.reload = true;
  const deep = await page.goto(`http://localhost:3000/project/${project.id}/interview`);
  outcomes.deepLinkStatus = deep?.status() ?? 0;
  await auth.expectPrivateAbsent([project.name]); outcomes.deepLink = true;
  await page.goBack(); await auth.expectPrivateAbsent([project.name]); outcomes.back = true;
  await other.reload(); await new AuthenticationPage(other, info).expectPrivateAbsent([project.name]); outcomes.secondTabReload = true;
  record('saved-signout', outcomes);
  await auth.humanAuth('the original saved account');
  expect(await page.evaluate(() => (window as any).Clerk.user.id)).toBe(identity);
  outcomes.reauthenticatedApiStatus = (await rpc(page, info, 'projects.get', { id: project.id })).status;
  await context.storageState({ path: path.join(run, 'saved-reauthenticated.json') });
  record('saved-signout', outcomes);
  await flushNetworkMonitor(other, info);
  expect(outcomes.unauthProjectsStatus).toBe(401); expect(outcomes.unauthDocumentsStatus).toBe(401);
  expect(outcomes.reauthenticatedApiStatus).toBe(200);
  expect(outcomes.primary, 'Primary tab hides cached private data').toBe(true);
  expect(outcomes.secondTab, 'Already-open second tab hides cached private data').toBe(true);
});

test('05 genuine Clerk revocation rejects current token, expires naturally and permits reauthentication', async ({ page }, info) => {
  requireBoth(); await loadAccount(page, 'A', info);
  const current = await token(page); expect(current).toBeTruthy();
  const jwt = claims(current!);
  expect((await rpc(page, info, 'projects.list', undefined, false, current)).status).toBe(200);
  const revoke = evidence('revoke', jwt.sid);
  expect(revoke.status).toBe('revoked');
  const immediate = await rpc(page, info, 'projects.list', undefined, false, current);
  record('revocation', { ...revoke, tokenExpiresAt: jwt.exp, checkedAt: new Date().toISOString(),
    checkedBeforeTokenExpiry: Date.now() < jwt.exp * 1000, immediateApiStatus: immediate.status });
  const wait = Math.max(0, jwt.exp * 1000 - Date.now() + 7_000);
  await page.waitForTimeout(Math.min(wait, 150_000));
  const expired = await rpc(page, info, 'projects.list', undefined, false, current);
  record('revocation-expired-token', { apiStatus: expired.status, waitedMs: wait });
  expect(expired.status).toBe(401);
  const auth = new AuthenticationPage(page, info);
  await auth.signInRecoverable(); await shot(page, info, 'revocation-signin-recovery');
  await auth.humanAuth('A');
  expect(await page.evaluate(() => (window as any).Clerk.user.id)).toBe(accounts().A!.clerkId);
  expect((await rpc(page, info, 'projects.list')).status).toBe(200);
  await page.context().storageState({ path: state('A') });
  expect(immediate.status, 'Revoked session must reject an unexpired token immediately').toBe(401);
});

test('04c recover sign-in after the ended saved session', async ({ page, context }, info) => {
  test.skip(process.env.AUTH_SAVED_RECOVERY !== '1', 'Standalone human recovery step only');
  const savedState = JSON.parse(fs.readFileSync(saved, 'utf8'));
  const originalClaims = JSON.parse(Buffer.from(savedState.cookies.find((c: any) => c.name === '__session').value.split('.')[1], 'base64url').toString());
  const expectedId = originalClaims.sub;
  await context.addCookies(savedState.cookies);
  const auth = new AuthenticationPage(page, info);
  await auth.humanAuth('the original saved account');
  expect(await page.evaluate(() => (window as any).Clerk.user.id)).toBe(expectedId);
  const newSession = claims((await token(page))!);
  expect(newSession.sid).not.toBe(originalClaims.sid);
  const oldSession = evidence('saved-session');
  expect(oldSession.status).toBe('removed');
  const listed = await rpc(page, info, 'projects.list');
  expect(listed.status).toBe(200); expect(listed.data.length).toBeGreaterThan(0);
  expect((await rpc(page, info, 'projects.get', { id: listed.data[0].id })).status).toBe(200);
  await context.storageState({ path: path.join(run, 'saved-reauthenticated.json') });
  await page.reload(); await auth.dashboard();
  expect((await rpc(page, info, 'projects.list')).status).toBe(200);
  await shot(page, info, 'reauthenticated-dashboard');
  record('saved-recovery', { sameAccount: true, differentSession: true, oldSessionStatus: oldSession.status,
    protectedApiStatus: 200, reload: true,
    originalStatePreserved: true, replacementState: 'saved-reauthenticated.json' });
});

test('06 dedicated disposable B deletion UI, cascade and identity/session distinction', async ({ page }, info) => {
  requireBoth(); await loadAccount(page, 'B', info);
  const account = accounts().B!;
  expect(evidence('identity', account.clerkId).createdAt).toBeGreaterThanOrEqual(Date.parse(accounts().startedAt));
  const before = evidence('snapshot', 'deletion-before');
  const auth = new AuthenticationPage(page, info);
  await auth.deleteLocalData();
  const after = evidence('snapshot', 'deletion-after');
  expect(after.owned.B.user).toHaveLength(0);
  for (const table of ['projects', 'documents', 'sessions', 'messages', 'keys']) expect(after.owned.B[table], table).toHaveLength(0);
  expect(after.owned.A).toEqual(before.owned.A);
  expect(Object.values(after.preexistingUnchanged)).not.toContain(false);
  const identity = evidence('identity', account.clerkId);
  record('deletion-result', { localDataDeleted: true, clerkIdentityRetained: !!identity.clerkId,
    clerkSessionStillActive: await page.evaluate(() => !!(window as any).Clerk.session), apiKeyCascadeRowsBefore: before.owned.B.keys.length });
  await shot(page, info, 'deletion-clerk-account-management');
  // Read-only authenticated check establishes that auto-provisioning creates a new empty local row.
  const result = await rpc(page, info, 'projects.get', { id: account.projectId });
  expect(result.status).toBe(404);
  const recreated = evidence('identity', account.clerkId);
  record('post-deletion-auth', { oldProjectStatus: result.status, newEmptyLocalUserCreated: !!recreated.localId,
    localIdChanged: recreated.localId !== account.localId, clerkIdentityDeleted: false });
  if (recreated.localId) {
    expect((await rpc(page, info, 'account.deleteData', { confirmation: 'DELETE' }, true)).status).toBe(200);
  }
  await auth.signOut();
  expect((await rpc(page, info, 'projects.list', undefined, false, null)).status).toBe(401);
  record('final-database', evidence('snapshot', 'final-database'));
});
