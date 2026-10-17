import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROVIDER_MODELS } from '@devdocs/shared';

const mock = vi.hoisted(() => ({
  findProject: vi.fn(), persist: vi.fn(), stream: vi.fn(), rateLimit: vi.fn(), key: vi.fn(),
}));
vi.mock('../../lib/db', async () => {
  const schema = await import('../../schema');
  return { ...schema, db: { query: { projects: { findFirst: mock.findProject } }, insert: () => ({ values: () => ({ onConflictDoUpdate: mock.persist }) }) } };
});
vi.mock('../../lib/aiStream', () => ({ streamAIResponse: mock.stream }));
vi.mock('../../lib/rateLimit', () => ({ checkRateLimit: mock.rateLimit }));
vi.mock('../../lib/apiKeys', () => ({ loadDecryptedKey: mock.key }));
vi.mock('../../middleware/hono-clerk-auth', () => ({ requireClerkAuth: async (c: any, next: () => Promise<void>) => { c.set('userId', 'test-user'); await next(); } }));
import app from './ai';

const body = {
  projectId: '00000000-0000-4000-a000-000000000001', domainId: 'planning', provider: 'anthropic', userMessage: 'Describe this project',
  interview: { lockedContext: { projectType: 'saas', teamSize: 'solo', timeline: 'under_1_month', budget: 'bootstrapped', experienceLevel: 'beginner' } },
};
const request = (overrides = {}) => app.request('/stream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, ...overrides }) });

beforeEach(() => {
  vi.stubEnv('AWS_ACCESS_KEY_ID', ''); vi.stubEnv('AWS_SECRET_ACCESS_KEY', '');
  mock.findProject.mockResolvedValue({ id: body.projectId });
  mock.rateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetIn: 60 });
  mock.key.mockResolvedValue('fake-provider-key');
  mock.persist.mockResolvedValue(undefined);
  mock.stream.mockImplementation((_prompt, _message, _config, callbacks) => { void callbacks.onDone('## Saved documentation'); });
});
afterEach(() => { vi.useRealTimers(); });

describe('AI HTTP and SSE boundaries with isolated provider/database doubles', () => {
  it('dispatches the requested Meta Contributor model from shared configuration', async () => {
    await (await request({ provider: 'metamuse' })).text();
    expect(PROVIDER_MODELS.metamuse.default).toBe('muse-spark-1.3-contributor');
    expect(mock.stream.mock.calls[0][2]).toMatchObject({ provider: 'metamuse', model: 'muse-spark-1.3-contributor' });
  });
  it('restores valid legacy context from the owned project', async () => {
    mock.findProject.mockResolvedValue({ id: body.projectId, interviewData: body.interview });
    expect(await (await request({ interview: undefined })).text()).toContain('"type":"done"');
  });
  it.each([false, true])('passes unresolved funding and timeline to the provider (saved fallback: %s)', async fallback => {
    const interview = { lockedContext: { ...body.interview.lockedContext, teamSize: 'eleven_plus', timeline: 'not_sure', budget: 'not_sure' } };
    if (fallback) mock.findProject.mockResolvedValue({ id: body.projectId, interviewData: interview });
    expect(await (await request({ interview: fallback ? undefined : interview })).text()).toContain('"type":"done"');
    const prompt = mock.stream.mock.calls[0][0];
    expect(prompt).toContain('Development team size: 11+ people');
    expect(prompt).toContain('Timeline to launch: Not sure yet (unresolved)');
    expect(prompt).toContain('Project funding: Not sure yet (unresolved)');
    expect(prompt).toContain('Never infer an infrastructure budget, currency amount, or spending range');
  });
  it.each(['1_3_months', '3_6_months'])('keeps the original saved %s range and 10+ team category in prompts', async timeline => {
    const interview = { lockedContext: { ...body.interview.lockedContext, teamSize: 'large', timeline } };
    mock.findProject.mockResolvedValue({ id: body.projectId, interviewData: interview });
    await (await request({ interview: undefined })).text();
    expect(mock.stream.mock.calls[0][0]).toContain('Development team size: 10+ people (original selection)');
    expect(mock.stream.mock.calls[0][0]).toContain('original selection; boundaries unconfirmed');
    expect(mock.stream.mock.calls[0][0]).not.toContain('Development team size: 11+');
  });
  it('rejects malformed legacy context without calling the provider', async () => {
    mock.findProject.mockResolvedValue({ id: body.projectId, interviewData: { lockedContext: 'invalid' } });
    expect((await request({ interview: undefined })).status).toBe(400);
    expect(mock.stream).not.toHaveBeenCalled();
  });
  it('cancels the provider and timeout when the reader disconnects', async () => {
    vi.useFakeTimers();
    let callbacks: any;
    let signal!: AbortSignal;
    mock.stream.mockImplementation((_p, _m, _c, cb, abortSignal) => { callbacks = cb; signal = abortSignal; });
    const response = await request({ persistDocument: true });
    await response.body!.cancel();
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => callbacks.onToken('late token')).not.toThrow();
    await callbacks.onDone('late completion');
    expect(mock.persist).not.toHaveBeenCalled();
  });
  it('times out a stalled provider with one terminal event', async () => {
    vi.useFakeTimers();
    let signal!: AbortSignal;
    mock.stream.mockImplementation((_p, _m, _c, _cb, abortSignal) => { signal = abortSignal; });
    const response = await request();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(signal.aborted).toBe(true);
    expect(await response.text()).toContain('"errorType":"timeout"');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects malformed JSON with 400', async () => {
    const response = await app.request('/stream', { method: 'POST', body: '{bad' });
    expect(response.status).toBe(400); expect(mock.stream).not.toHaveBeenCalled();
  });
  it.each([{ projectId: 'invalid' }, { domainId: 'unknown' }, { provider: 'unknown' }, { userMessage: '' }, { userMessage: 'x'.repeat(4001) }])('validates request %j', async input => {
    expect((await request(input)).status).toBe(400); expect(mock.stream).not.toHaveBeenCalled();
  });
  it('rejects inaccessible/deleted projects before charging rate budget', async () => {
    mock.findProject.mockResolvedValue(undefined);
    expect((await request()).status).toBe(404); expect(mock.rateLimit).not.toHaveBeenCalled();
  });
  it('returns rate-limit headers without provider calls', async () => {
    mock.rateLimit.mockResolvedValue({ allowed: false, resetIn: 42 });
    const response = await request(); expect(response.status).toBe(429); expect(response.headers.get('retry-after')).toBe('42'); expect(mock.stream).not.toHaveBeenCalled();
  });
  it('reports missing provider key', async () => { mock.key.mockResolvedValue(null); expect((await request()).status).toBe(400); expect(mock.stream).not.toHaveBeenCalled(); });
  it('reports unconfigured Bedrock', async () => { expect((await request({ provider: 'bedrock' })).status).toBe(400); });
  it('persists document generation before successful terminal event', async () => {
    let finish!: () => void;
    mock.persist.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const response = await request({ persistDocument: true });
    expect(mock.persist).toHaveBeenCalledOnce();
    finish(); expect(await response.text()).toContain('"type":"done"');
  });
  it('never persists chat openers or clarification replies', async () => {
    expect(await (await request()).text()).toContain('"type":"done"'); expect(mock.persist).not.toHaveBeenCalled();
  });
  it('rejects empty provider output without overwriting saved documents', async () => {
    mock.stream.mockImplementation((_p, _m, _c, callbacks) => { void callbacks.onDone('  '); });
    const text = await (await request({ persistDocument: true })).text();
    expect(text).toContain('"type":"error"'); expect(text).not.toContain('"type":"done"'); expect(mock.persist).not.toHaveBeenCalled();
  });
  it('reports persistence failure rather than false completion', async () => {
    mock.persist.mockRejectedValue(new Error('database unavailable'));
    const text = await (await request({ persistDocument: true })).text();
    expect(text).toContain('"errorType":"persistence"'); expect(text).not.toContain('"type":"done"');
  });
  it('emits token deltas and a single terminal event', async () => {
    mock.stream.mockImplementation((_p, _m, _c, callbacks) => { callbacks.onToken('one'); callbacks.onToken('two'); void callbacks.onDone('onetwo'); });
    const events = (await (await request()).text()).trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
    expect(events).toEqual([{ type: 'token', text: 'one' }, { type: 'token', text: 'two' }, { type: 'done', text: 'onetwo' }]);
  });
});

describe('question-first interview response contract', () => {
  const question = { kind: 'question', question: { text: 'Should records be shared across the team?' } };
  const document = { kind: 'document', markdown: '## Planning\n\n**Confirmed:** Team workspace.\n\n**Assumption:** Members share records.' };
  it('returns a validated follow-up without creating a document', async () => {
    mock.stream.mockImplementation((_p, _m, _c, cb) => { cb.onToken('{internal protocol'); void cb.onDone(JSON.stringify(question)); });
    const text = await (await request({ responseMode: 'interview' })).text();
    expect(text).toContain('"kind":"question"'); expect(text).not.toContain('internal protocol');
    expect(mock.persist).not.toHaveBeenCalled();
  });
  it('waits for canonical persistence before reporting completion', async () => {
    let finish!: () => void;
    mock.persist.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    mock.stream.mockImplementation((_p, _m, _c, cb) => { void cb.onDone(JSON.stringify(document)); });
    const response = await request({ responseMode: 'interview' });
    const reader = response.body!.getReader(); const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    text += decoder.decode((await reader.read()).value);
    expect(text).toContain('"status":"saving"'); expect(text).not.toContain('"type":"done"');
    finish(); text += decoder.decode((await reader.read()).value);
    expect(text).toContain('"kind":"document"'); expect(text).toContain('"type":"done"');
    reader.releaseLock();
  });
  it('returns generated content on a persistence failure for save-only retry', async () => {
    mock.persist.mockRejectedValue(new Error('Offline'));
    mock.stream.mockImplementation((_p, _m, _c, cb) => { void cb.onDone(JSON.stringify(document)); });
    const text = await (await request({ responseMode: 'interview' })).text();
    expect(text).toContain('"errorType":"persistence"'); expect(text).toContain('"generatedDocument"');
    expect(text).not.toContain('"type":"done"');
  });
  it.each(['not JSON', JSON.stringify({ kind: 'document', markdown: '  ' }), JSON.stringify({ kind: 'question', question: { text: 'Choose?', choices: [{ id: 'only', title: 'Only' }] } })])('rejects malformed responses without saving: %s', async output => {
    mock.stream.mockImplementation((_p, _m, _c, cb) => { void cb.onDone(output); });
    const text = await (await request({ responseMode: 'interview' })).text();
    expect(text).toContain('invalid interview response'); expect(mock.persist).not.toHaveBeenCalled();
  });
  it.each([{ followUpCount: 1 }, { domainId: 'database' }])('prevents repeated clarification and preserves database platform-only flow: %j', async overrides => {
    mock.stream.mockImplementation((_p, _m, _c, cb) => { void cb.onDone(JSON.stringify(question)); });
    const text = await (await request({ responseMode: 'interview', ...overrides })).text();
    expect(text).toContain('invalid interview response'); expect(mock.persist).not.toHaveBeenCalled();
  });
  it('provides previous confirmed answers and explicit uncertainty rules to the provider', async () => {
    mock.stream.mockImplementation((_p, _m, _c, cb) => { void cb.onDone(JSON.stringify(document)); });
    await (await request({ responseMode: 'interview', followUpCount: 1, userMessage: 'Not sure', interview: { ...body.interview, confirmedAnswers: [{ domainId: 'api', answer: 'Export invoices' }] } })).text();
    const prompt = mock.stream.mock.calls[0][0];
    expect(prompt).toContain('Export invoices'); expect(prompt).toContain('Do not ask another question');
    expect(prompt).toContain('Accept "not sure" as explicit uncertainty'); expect(prompt).toContain('confirmed decisions');
  });
});
