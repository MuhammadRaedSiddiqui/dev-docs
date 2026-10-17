import type { Page } from '@playwright/test';
import type { DomainId, ProjectType } from '@devdocs/shared';
import { getActiveDomains } from '../../../lib/interview/domains';

export const PROJECT_ID = '00000000-0000-4000-a000-000000000001';
export const context = { projectType: 'saas' as ProjectType, teamSize: 'small', timeline: '1_3_months', budget: 'bootstrapped', experienceLevel: 'intermediate' };
export function project(type: ProjectType = 'saas', completed = 0) {
  const domains = getActiveDomains(type);
  return {
    id: PROJECT_ID, name: 'Team Planner', type, status: completed === domains.length ? 'complete' : 'in_progress',
    description: 'Planning workspace', domainsCompleted: completed, updatedAt: 'Just now',
    interviewData: {
      lockedContext: { ...context, projectType: type }, lockedChoices: {},
      completedDomains: domains.slice(0, completed).map(d => d.id),
      conversationHistory: domains.slice(0, completed).map(d => ({ role: 'assistant', content: `## ${d.label}\n\nSaved ${d.id} decisions.`, domainId: d.id })),
      elaboration: 'A planning workspace for remote teams',
    },
    documents: domains.slice(0, completed).map(d => ({ id: `${PROJECT_ID}-${d.id}`, projectId: PROJECT_ID, domainId: d.id, content: `## ${d.label}\n\nSaved ${d.id} decisions.`, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })),
  };
}
type MockProject = Omit<ReturnType<typeof project>, 'interviewData'> & { interviewData: any };
type Failure = { message: string; code?: string; remaining?: number };
export type StreamMode = 'success' | 'auth' | 'rate_limit' | 'persistence' | 'model_unavailable' | 'empty' | 'eof' | 'saved_eof' | 'malformed' | 'network' | 'pending';

/** A per-test stateful API simulator. Unknown procedures fail instead of
 * silently returning a successful shape. This is not a substitute for API tests. */
export class MockApplication {
  projects: MockProject[] = [project()];
  keys = [{ provider: 'anthropic', maskedKey: 'sk-ant-••••1234', createdAt: '2026-01-01T00:00:00Z' }];
  bedrock = false;
  failures: Record<string, Failure> = {};
  streamMode: StreamMode = 'success';
  followUp = false;
  streamGate: Promise<void> | null = null;
  calls: { procedure: string; input: any }[] = [];
  streams: any[] = [];
  unexpected: string[] = [];
  private sequence = 1;
  constructor(private page: Page) {}

  fail(procedure: string, message = 'Service temporarily unavailable', remaining = Infinity, code = 'INTERNAL_SERVER_ERROR') {
    this.failures[procedure] = { message, remaining, code };
  }
  async install() {
    await this.page.route('**/trpc/**', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }); return; }
      const url = new URL(request.url());
      const procedures = decodeURIComponent(url.pathname.split('/trpc/')[1]).split(',');
      const batch = url.searchParams.get('batch') === '1';
      const input = request.method() === 'GET' ? JSON.parse(url.searchParams.get('input') ?? '{}') : request.postDataJSON();
      const results = procedures.map((procedure, i) => {
        const data = batch ? input?.[String(i)] : input;
        this.calls.push({ procedure, input: data });
        const failure = this.failures[procedure];
        if (failure && (failure.remaining ?? 0) > 0) {
          failure.remaining!--;
          return { error: { message: failure.message, code: -32603, data: { code: failure.code, httpStatus: failure.code === 'NOT_FOUND' ? 404 : 500, path: procedure } } };
        }
        try { return { result: { data: this.respond(procedure, data) } }; }
        catch (error) { return { error: { message: String(error), code: -32603, data: { code: 'NOT_FOUND', httpStatus: 404, path: procedure } } }; }
      });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(batch ? results : results[0]) });
    });
    await this.page.route('**/ai/bedrock-status', route => route.fulfill({ json: { configured: this.bedrock, region: this.bedrock ? 'us-east-1' : null, model: this.bedrock ? 'test-model' : null } }));
    await this.page.route('**/ai/stream', async route => {
      const input = route.request().postDataJSON();
      this.streams.push(input);
      if (this.streamGate) await this.streamGate;
      if (this.streamMode === 'pending') return;
      if (this.streamMode === 'network') { await route.abort('failed'); return; }
      if (this.streamMode === 'auth' || this.streamMode === 'rate_limit') {
        await route.fulfill({ status: this.streamMode === 'auth' ? 401 : 429, json: { message: this.streamMode === 'auth' ? 'Provider key rejected' : 'Rate limit reached. Try again shortly.' } }); return;
      }
      let body: string;
      const text = `## ${input.domainId}\n\nGenerated ${input.domainId} decisions for the project.`;
      if (this.streamMode === 'persistence') body = `data: ${JSON.stringify({ type: 'error', errorType: 'persistence', message: 'The response could not be saved. Please retry.', generatedDocument: text })}\n\n`;
      else if (this.streamMode === 'model_unavailable') body = `data: ${JSON.stringify({ type: 'error', errorType: 'model_unavailable', message: 'The Meta Muse text model is unavailable for this API key. Enable Muse Spark access in your Meta developer project, then retry, or choose another configured provider in Settings.' })}\n\n`;
      else if (this.streamMode === 'malformed') body = 'data: invalid-json\n\n';
      else if (this.streamMode === 'eof') body = `data: ${JSON.stringify({ type: 'token', text: 'Incomplete response' })}\n\n`;
      else if (this.streamMode === 'saved_eof') { this.saveDocument(input.projectId, input.domainId, text); body = `data: ${JSON.stringify({ type: 'status', status: 'saving' })}\n\n`; }
      else {
        const content = this.streamMode === 'empty' ? '' : text;
        const followUp = this.followUp && input.responseMode === 'interview' && input.followUpCount === 0;
        const result = followUp ? { kind: 'question', question: { text: 'Should team members share records or keep them private?', placeholder: 'Describe the access boundary…' } } : { kind: 'document', markdown: content };
        if ((input.persistDocument || input.responseMode === 'interview') && content && !followUp) this.saveDocument(input.projectId, input.domainId, content);
        body = `data: ${JSON.stringify({ type: 'done', text: content, ...(input.responseMode === 'interview' && content ? { result } : {}) })}\n\n`;
      }
      await route.fulfill({ contentType: 'text/event-stream', body });
    });
  }
  private saveDocument(projectId: string, domainId: DomainId, content: string) {
    const p = this.projects.find(p => p.id === projectId)!;
    const previous = p.documents.find(d => d.domainId === domainId);
    if (previous) previous.content = content;
    else p.documents.push({ id: `${projectId}-${domainId}`, projectId, domainId, content, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
    return p.documents.find(d => d.domainId === domainId);
  }
  private respond(name: string, input: any): unknown {
    switch (name) {
      case 'projects.list': return this.projects;
      case 'projects.get': { const p = this.projects.find(p => p.id === input.id); if (!p) throw new Error('Project not found'); return p; }
      case 'projects.create': {
        const p = { ...project(input.type), id: `00000000-0000-4000-a000-${String(++this.sequence).padStart(12, '0')}`, name: input.name, interviewData: null, documents: [] };
        this.projects.push(p); return p;
      }
      case 'projects.update': {
        const p = this.projects.find(p => p.id === input.id)!;
        Object.assign(p, input.data);
        p.domainsCompleted = p.interviewData?.completedDomains?.length ?? 0;
        return p;
      }
      case 'projects.delete': this.projects = this.projects.filter(p => p.id !== input.id); return { success: true };
      case 'documents.list': return this.projects.flatMap(p => p.documents.map(d => ({ ...d, projectName: p.name, projectType: p.type })));
      case 'documents.listByProject': return this.projects.find(p => p.id === input.projectId)?.documents ?? [];
      case 'documents.update': return this.saveDocument(input.projectId, input.domainId, input.content);
      case 'keys.list': return this.keys;
      case 'keys.upsert': {
        const key = { provider: input.provider, maskedKey: `${input.provider}-••••1234`, createdAt: '2026-01-01T00:00:00Z' };
        this.keys = [...this.keys.filter(k => k.provider !== input.provider), key]; return key;
      }
      case 'keys.delete': this.keys = this.keys.filter(k => k.provider !== input.provider); return { success: true };
      case 'sessions.create': return { id: '00000000-0000-4000-a000-000000000099' };
      case 'sessions.logMessage': case 'sessions.update': return { success: true };
      case 'account.exportData': return {
        schemaVersion: 1, exportedAt: new Date().toISOString(), account: { email: 'tester@example.test' },
        projects: this.projects, documents: this.projects.flatMap(p => p.documents),
        interviewSessions: [], interviewMessages: [], apiKeyConnections: this.keys,
      };
      case 'account.deleteData': this.projects = []; this.keys = []; return { success: true };
      default: this.unexpected.push(name); throw new Error(`Unmocked procedure: ${name}`);
    }
  }
}
