import fs from 'node:fs';
import { test, expect } from '../lib/fixtures';
import { DashboardPage } from '../lib/pages/DashboardPage';
import { InterviewPage } from '../lib/pages/InterviewPage';
import { SettingsPage } from '../lib/pages/SettingsPage';
import { getActiveDomains } from '../../lib/interview/domains';
import { captureLiveEvidence, readLiveEvidence } from '../lib/live-evidence';
import { flushNetworkMonitor, getContractViolations, getFailedRequests, attachNetworkMonitor } from '../lib/monitoring/networkMonitor';
import { getConsoleErrors } from '../lib/monitoring/consoleMonitor';

test('live SaaS: all ten domains, skip/revisit, rewind, choices and saved completion', async ({ page }, info) => {
  test.setTimeout(20 * 60_000);
  const allowance = Number(process.env.E2E_PROVIDER_SPEND_USD);
  test.skip(!(allowance > 0), 'Requires explicit live spending authorization');
  expect(process.env.PLAYWRIGHT).toBe('0');
  expect(process.env.ENABLE_AI_TRIAGE).toBe('false');
  expect(process.env.E2E_PROVIDER).toBe('metamuse');
  const recordPath = process.env.E2E_RUN_RECORD;
  test.skip(!recordPath, 'Full interviews require a durable E2E_RUN_RECORD and spending ledger');
  const record = fs.existsSync(recordPath!) ? JSON.parse(fs.readFileSync(recordPath!, 'utf8')) : { checkpoints: [] };
  const saveRecord = () => fs.writeFileSync(recordPath!, JSON.stringify(record, null, 2));
  const interview = new InterviewPage(page, info);
  const spending = await interview.limitPaidGenerations(allowance, 30);
  attachNetworkMonitor(page, info, [{ urlPattern: /\/trpc\/projects\.get/, schemaPath: 'e2e/contracts/projects.get.schema.json' }]);
  const settings = new SettingsPage(page, info);
  await settings.gotoSettings();
  await settings.selectActiveProvider('metamuse');
  if (!record.projectId) {
    const dashboard = new DashboardPage(page, info);
    await dashboard.gotoDashboard();
    record.name = `E2E Full SaaS ${Date.now()}`;
    record.projectId = await dashboard.createProject(record.name, 'saas');
    saveRecord();
    await interview.submitDiscovery({ teamSize: 'small', timeline: '1_under_3_months', budget: 'bootstrapped', experience: 'intermediate' });
    await interview.expectPlanningOpener();
  } else {
    await interview.gotoInterview(record.projectId);
  }
  const projectId = record.projectId as string;
  await info.attach('live-project', { body: JSON.stringify({ projectId, name: record.name, provider: 'metamuse' }), contentType: 'application/json' });
  const domains = getActiveDomains('saas');
  const input = page.getByPlaceholder(/Type your answer|Ask a question or request a change/).filter({ visible: true });
  const retry = page.getByRole('button', { name: 'Try again', exact: true }).filter({ visible: true });
  const button = (name: string | RegExp) => page.getByRole('button', { name }).filter({ visible: true }).first();
  // Natural provider failures are retained, checked against the real database,
  // and retried at most twice. No simulated response is installed in this lane.
  async function settle(expectedCount: number, domainId: string, priorDocument?: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect.poll(async () => {
        if (await retry.isVisible()) return 'error';
        const pct = await page.getByRole('progressbar').filter({ visible: true }).getAttribute('aria-valuenow');
        return pct === String(expectedCount * 10) && await input.isEnabled() ? 'ready' : 'busy';
      }, { timeout: 70_000, intervals: [500, 1000] }).not.toBe('busy');
      if (!(await retry.isVisible())) break;
      const evidence = await captureLiveEvidence(projectId, `${domainId}-failure-${attempt}`, info);
      // The document generation must not advance progress when it failed.
      if (evidence.project.interview_data.completedDomains.length < expectedCount) {
        expect(evidence.project.status).not.toBe('complete');
        expect(evidence.project.interview_data.completedDomains).not.toContain(domainId);
        expect(evidence.documents.find(d => d.domain_id === domainId)?.content).toBe(priorDocument);
      }
      if (attempt === 2) throw new Error(`Provider failed after bounded retries in ${domainId}`);
      await retry.click();
    }
    await expect.poll(() => readLiveEvidence(projectId).project.interview_data.completedDomains.length,
      { timeout: 45_000, intervals: [1000, 2000] }).toBe(expectedCount);
    await expect(input).toBeEnabled();
  }
  async function checkpoint(name: string, count: number) {
    const before = await captureLiveEvidence(projectId, name, info);
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('progressbar').filter({ visible: true })).toHaveAttribute('aria-valuenow', String(count * 10), { timeout: 45_000 });
    await expect(input).toBeEnabled({ timeout: 45_000 });
    const after = readLiveEvidence(projectId);
    expect(after.project.interview_data.completedDomains).toEqual(before.project.interview_data.completedDomains);
    expect(after.project.interview_data.lockedChoices).toEqual(before.project.interview_data.lockedChoices);
    // Compare every saved conversational turn through the actual rendered UI.
    for (const message of before.project.interview_data.conversationHistory) {
      if (message.role === 'user') await expect(page.getByText(message.content, { exact: true }).filter({ visible: true }).last()).toBeVisible();
    }
    record.checkpoints.push({ name, count, at: new Date().toISOString() }); saveRecord();
  }
  let completed = readLiveEvidence(projectId).project.interview_data?.completedDomains ?? [];
  if (!completed.includes('planning')) {
    await interview.answerOpenQuestion('A habit tracker for remote teams: workspace admins invite teammates, users create habits, check in daily, view streaks and export their history. Tenant isolation and accessible mobile screens are required.');
    await settle(1, 'planning');
  }
  if (!record.rewindVerified) {
    completed = readLiveEvidence(projectId).project.interview_data.completedDomains;
    if (!completed.includes('architecture')) {
      await button(/Skip for now/).click();
      await settle(2, 'architecture');
    }
    await checkpoint('skip-saved-reloaded', 2);
    expect(readLiveEvidence(projectId).documents.find(d => d.domain_id === 'architecture')?.content).toContain('Deferred to v2');
    await button('Revisit Architecture').click();
    await expect.poll(() => readLiveEvidence(projectId).project.interview_data.completedDomains, { timeout: 45_000 }).toEqual(['planning']);
    await checkpoint('rewind-saved-reloaded', 1);
    expect(readLiveEvidence(projectId).project.interview_data.conversationHistory.some(m => m.domainId === 'database')).toBe(false);
    record.rewindVerified = true; saveRecord();
  }
  const cards: Record<string, string> = { database: 'Managed PostgreSQL', environment: 'Local + Staging + Prod', auth: 'Clerk', testing: 'Vitest + Playwright', deployment: 'Vercel' };
  const answers: Record<string, string> = {
    api: 'Workspace admins invite teammates. Members create, list, update and archive habits, create daily check-ins, view streak summaries and export their own history. Require tenant ownership, idempotent check-ins, pagination and consistent error responses.',
    frontend: 'Login, workspace selection, responsive dashboard with habit list and streak summary, habit detail with calendar and daily check-in, member invitation screen, and settings with data export. Include keyboard navigation and loading, empty and failure states.',
  };
  for (const domain of domains.slice(1)) {
    completed = readLiveEvidence(projectId).project.interview_data.completedDomains;
    if (completed.includes(domain.id)) continue;
    await expect(input).toBeEnabled({ timeout: 45_000 });
    const prior = readLiveEvidence(projectId).documents.find(d => d.domain_id === domain.id)?.content;
    if (domain.id === 'architecture' || domain.id === 'monitoring') {
      await button('I need a custom option').click();
      await page.getByPlaceholder('Describe your custom choice...').filter({ visible: true }).fill(domain.id === 'architecture' ? 'Modular monolith with tenant boundaries' : 'Sentry with structured logs and metrics');
      await button('Confirm').click();
    } else if (domain.mode === 'open') await interview.answerOpenQuestion(answers[domain.id]);
    else await interview.pickCard(cards[domain.id]);
    const count = domains.findIndex(d => d.id === domain.id) + 1;
    await settle(count, domain.id, prior);
    if ([3, 6, 10].includes(count)) await checkpoint(`checkpoint-${count}-domains`, count);
  }
  const final = await captureLiveEvidence(projectId, 'full-completion-database', info);
  expect(final.project.status).toBe('complete');
  expect(final.project.interview_data.completedDomains).toEqual(domains.map(d => d.id));
  expect(final.documents.map(d => d.domain_id).sort()).toEqual(domains.map(d => d.id).sort());
  for (const document of final.documents) {
    expect(document.content.trim().length).toBeGreaterThan(100);
    expect(document.content).not.toContain('Deferred to v2');
  }
  await page.screenshot({ path: info.outputPath('live-interview.png') });
  await info.attach('provider-budget', { body: JSON.stringify(spending()), contentType: 'application/json' });
  await flushNetworkMonitor(page, info);
  expect(getContractViolations(page)).toEqual([]);
  expect(getFailedRequests(page)).toEqual([]);
  expect(getConsoleErrors(page)).toEqual([]);
  record.complete = true; saveRecord();
});
