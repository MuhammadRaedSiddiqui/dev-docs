import fs from 'node:fs';
import JSZip from 'jszip';
import { test, expect } from '../lib/fixtures';
import { InterviewPage } from '../lib/pages/InterviewPage';
import { captureLiveEvidence, readLiveEvidence } from '../lib/live-evidence';
import { getActiveDomains, buildFullDocument } from '../../lib/interview/domains';
import type { ProjectContext } from '../../lib/types';
import { flushNetworkMonitor, getFailedRequests } from '../lib/monitoring/networkMonitor';
import { getConsoleErrors } from '../lib/monitoring/consoleMonitor';

const domains = getActiveDomains('saas');
test('live documents: edit all ten, discard drafts, reload, parse Markdown and ZIP', async ({ page }, info) => {
  test.setTimeout(12 * 60_000);
  test.skip(!process.env.E2E_RUN_RECORD, 'Complete a full live interview with E2E_RUN_RECORD first');
  expect(process.env.PLAYWRIGHT).toBe('0');
  const run = JSON.parse(fs.readFileSync(process.env.E2E_RUN_RECORD!, 'utf8'));
  const projectId = run.projectId as string;
  const original = await captureLiveEvidence(projectId, 'before-edit-database', info);
  expect(original.project.status).toBe('complete');
  expect(original.documents).toHaveLength(10);
  await page.route('**/ai/stream', route => route.abort('blockedbyclient'));
  await new InterviewPage(page, info).gotoInterview(projectId);
  const preview = page.getByRole('region', { name: 'Documentation preview' }).filter({ visible: true });
  await expect(preview.getByRole('button', { name: /\.md/ })).toBeEnabled({ timeout: 45_000 });
  await preview.getByRole('button', { name: 'Edit', exact: true }).click();
  const expected: Record<string, string> = {};
  for (const domain of domains) {
    const editor = preview.getByRole('textbox', { name: `${domain.label} documentation`, exact: true });
    const saved = original.documents.find(d => d.domain_id === domain.id)!.content;
    const revision = `\n\n## Live revision ${domain.id}\n\nSaved domain: ${domain.id}. Unicode: café — اردو — 日本語 🔐.\n\n---\n\nAfter horizontal rule: ${domain.id}.\n`;
    expected[domain.id] = saved.includes(`## Live revision ${domain.id}`) ? saved : saved + revision;
    await expect(editor).toHaveValue(saved);
    await editor.fill(`${saved}\n\nUNSAVED ${domain.id}`);
    await expect(preview.getByRole('button', { name: /\.md/ })).toBeDisabled();
    await expect(preview.getByRole('button', { name: /\.zip/ })).toBeDisabled();
    await expect(preview.getByRole('button', { name: 'Preview', exact: true })).toBeDisabled();
    for (const control of await page.getByRole('button', { name: /Download DOCUMENTATION\.md|or download as \.zip/ }).filter({ visible: true }).all()) await expect(control).toBeDisabled();
    if (domain.id === 'planning') {
      const draftEvidence = readLiveEvidence(projectId);
      expect(draftEvidence.documents.find(d => d.domain_id === domain.id)?.content).toBe(saved);
      expect(draftEvidence.project.interview_data).not.toHaveProperty('documentDrafts');
    }
    await preview.getByRole('button', { name: `Discard ${domain.label} changes`, exact: true }).click();
    await expect(editor).toHaveValue(saved);
    await expect(preview.getByRole('button', { name: /\.zip/ })).toBeEnabled();
    await editor.fill(expected[domain.id]);
    const saving = page.waitForResponse(r => r.url().includes('/trpc/documents.update') && r.request().method() === 'POST' && r.ok());
    await preview.getByRole('button', { name: `Save ${domain.label}`, exact: true }).click();
    await saving;
    await expect(preview.getByRole('button', { name: `Save ${domain.label}`, exact: true })).toBeDisabled();
    expect(readLiveEvidence(projectId).documents.find(d => d.domain_id === domain.id)?.content).toBe(expected[domain.id]);
  }
  const edited = await captureLiveEvidence(projectId, 'after-edit-database', info);
  expect(edited.project.status).toBe('complete');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(preview.getByRole('button', { name: 'Edit', exact: true })).toBeEnabled({ timeout: 45_000 });
  await preview.getByRole('button', { name: 'Edit', exact: true }).click();
  for (const domain of domains) await expect(preview.getByRole('textbox', { name: `${domain.label} documentation`, exact: true })).toHaveValue(expected[domain.id]);
  await page.screenshot({ path: info.outputPath('live-edits-reloaded.png') });
  await preview.getByRole('button', { name: 'Preview', exact: true }).click();
  async function download(pattern: RegExp) {
    const [file] = await Promise.all([page.waitForEvent('download'), preview.getByRole('button', { name: pattern }).click()]);
    const output = info.outputPath(file.suggestedFilename());
    await file.saveAs(output);
    await info.attach(file.suggestedFilename(), { path: output, contentType: pattern.source.includes('zip') ? 'application/zip' : 'text/markdown' });
    return { file, body: fs.readFileSync(output) };
  }
  const md = await download(/\.md/);
  expect(md.file.suggestedFilename()).toBe('DOCUMENTATION.md');
  const context = (edited.project.interview_data as unknown as { lockedContext: ProjectContext }).lockedContext;
  expect(md.body.toString('utf8')).toBe(buildFullDocument(context, expected));
  const zipped = await download(/\.zip/);
  expect(zipped.file.suggestedFilename()).toBe(`${run.name.replace(/\s+/g, '-').toLowerCase()}-docs.zip`);
  const zip = await JSZip.loadAsync(zipped.body);
  expect(Object.keys(zip.files).filter(name => !zip.files[name].dir).sort()).toEqual([...domains.map(d => `docs/${d.file}`), 'docs/README.md'].sort());
  const readme = await zip.file('docs/README.md')!.async('string');
  for (const domain of domains) {
    const body = await zip.file(`docs/${domain.file}`)!.async('string');
    expect(body).toBe(expected[domain.id]);
    expect(readme).toContain(domain.file);
    expect((body.match(/## Live revision /g) ?? []).length).toBe(1);
    expect((md.body.toString('utf8').match(new RegExp(`## Live revision ${domain.id}\\n`, 'g')) ?? []).length).toBe(1);
    for (const other of domains.filter(d => d.id !== domain.id)) expect(body).not.toContain(`## Live revision ${other.id}`);
  }
  await info.attach('export-verification', { body: JSON.stringify({ projectId, domains: domains.map(d => d.id), exactMarkdownMatch: true, exactZipBodies: true, unicodeAndRules: true, filenames: Object.keys(zip.files) }), contentType: 'application/json' });
  await flushNetworkMonitor(page, info);
  expect(getFailedRequests(page)).toEqual([]);
  expect(getConsoleErrors(page)).toEqual([]);
});
