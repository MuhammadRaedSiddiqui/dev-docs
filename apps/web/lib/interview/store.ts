import { create } from 'zustand';
import type { ChatMessage, DomainDefinition, DomainId, DomainPhase, ProjectContext } from '@/lib/types';
import type { InterviewWorkflow, InterviewQuestion } from '@devdocs/shared';
import { DOMAINS, getActiveDomains, getDomain, buildFullDocument } from './domains';
import { mainQuestion } from './questions';
import { CARD_CHOICES } from './choices';
import { getActiveConfig, type AIProvider } from '@/lib/ai/provider';
import { streamAIResponse, type StreamErrorType } from '@/lib/ai/stream';
import { makeTRPCClient } from '@/lib/trpc';
import { SessionLogger } from '@/lib/session/logger';
import { analytics } from '@/lib/analytics';

export type OperationStatus = 'ready' | 'submitting' | 'preparing' | 'generating' | 'saving' | 'follow_up' | 'saved' | 'error';
export interface LastError { type: StreamErrorType; message: string }
type Pending = NonNullable<InterviewWorkflow['pending']>;
const emptyDraft = () => ({ text: '', choice: '', context: '' });
interface ResumeData {
  lockedContext: ProjectContext;
  lockedChoices: Partial<Record<DomainId, Record<string, string>>>;
  completedDomains: DomainId[];
  domainContent: Partial<Record<DomainId, string>>;
  conversationHistory: ChatMessage[];
  elaboration: string;
  workflow?: InterviewWorkflow;
}
interface InterviewState {
  lockedContext: ProjectContext | null;
  lockedChoices: ResumeData['lockedChoices'];
  domainPhases: Record<DomainId, DomainPhase>;
  currentDomain: DomainId;
  completedDomains: DomainId[];
  domainContent: ResumeData['domainContent'];
  documentDrafts: Partial<Record<DomainId, string>>;
  isEditingDocuments: boolean;
  messages: ChatMessage[];
  elaboration: string;
  activeDomains: DomainDefinition[];
  projectName: string;
  projectId: string | null;
  question: InterviewQuestion;
  followUpCount: number;
  draft: InterviewWorkflow['draft'];
  pending: InterviewWorkflow['pending'];
  status: OperationStatus;
  notice: string;
  isThinking: boolean;
  isStreaming: boolean;
  isComplete: boolean;
  lastError: LastError | null;
  currentProvider: AIProvider | null;
  abortController: AbortController | null;
  tokenGetter: (() => Promise<string | null>) | null;
  sessionLogger: SessionLogger | null;
  interviewStartAt: number | null;
  domainStartAt: number | null;
  setProjectName: (name: string) => void;
  setProjectId: (id: string) => void;
  setTokenGetter: (getter: () => Promise<string | null>) => void;
  refreshProvider: () => void;
  initializeSession: (getToken?: () => Promise<string | null>) => Promise<void>;
  setLockedContext: (context: ProjectContext) => void;
  setAnswerDraft: (draft: Partial<InterviewWorkflow['draft']>) => void;
  submitAnswer: () => void;
  sendMessage: (text: string) => void;
  lockDomainChoice: (domain: DomainId, key: string, value: string) => void;
  retryLast: () => void;
  cancelStream: () => void;
  setDomainContent: (domain: DomainId, content: string) => void;
  setDocumentDraft: (domain: DomainId, content?: string) => void;
  setDocumentEditing: (editing: boolean) => void;
  regenerateDomain: (domain: DomainId) => void;
  resumeFromSaved: (data: ResumeData) => void;
  saveProgress: () => Promise<void>;
  reset: () => void;
}
type Set = (value: Partial<InterviewState> | ((state: InterviewState) => Partial<InterviewState>)) => void;
type Get = () => InterviewState;
const phases = () => Object.fromEntries(DOMAINS.map(d => [d.id, 'not_started'])) as Record<DomainId, DomainPhase>;
const busy = (s: InterviewState) => s.isThinking || s.isStreaming;
let saveQueue: Promise<unknown> = Promise.resolve();

export function interviewSnapshot(s: InterviewState) {
  return {
    lockedContext: s.lockedContext, lockedChoices: s.lockedChoices,
    completedDomains: s.completedDomains, conversationHistory: s.messages, elaboration: s.elaboration,
    workflow: { currentDomain: s.currentDomain, question: s.question, followUpCount: s.followUpCount, draft: s.draft, pending: s.pending },
  };
}

function complete(set: Set, get: Get, operation: Pending, content: string) {
  const s = get();
  if (s.pending !== operation) return;
  const completed = [...new Set([...s.completedDomains, operation.domainId])];
  const isComplete = s.activeDomains.every(d => completed.includes(d.id));
  const next = !operation.regenerate && s.activeDomains.find(d => !completed.includes(d.id));
  set({ domainContent: { ...s.domainContent, [operation.domainId]: content }, completedDomains: completed,
    domainPhases: { ...s.domainPhases, [operation.domainId]: 'complete' }, pending: null,
    status: operation.regenerate ? (isComplete ? 'saved' : s.followUpCount ? 'follow_up' : 'ready') : 'saved',
    lastError: null, isThinking: false, isStreaming: false, abortController: null, isComplete,
    notice: `${getDomain(operation.domainId).label} saved.${next ? ` Now in ${next.label}.` : isComplete ? ' Interview complete.' : ''}`,
    ...(next ? { currentDomain: next.id, question: mainQuestion(next.id), followUpCount: 0,
      draft: emptyDraft(), status: 'ready', domainStartAt: Date.now(),
      domainPhases: { ...s.domainPhases, [operation.domainId]: 'complete', [next.id]: 'interviewing' } } : {}) });
  if (!operation.regenerate) {
    try { analytics.domainCompletedWithTiming(s.projectId ?? '', operation.domainId, s.domainStartAt ? Date.now() - s.domainStartAt : 0, s.currentProvider ?? '', ''); } catch {}
    void s.sessionLogger?.updateSession({ totalDomainsCompleted: completed.length, totalMessages: s.messages.length });
    if (isComplete) {
      try { analytics.interviewCompleted(s.projectId ?? '', completed.length, s.interviewStartAt ? Date.now() - s.interviewStartAt : 0, ''); } catch {}
      void s.sessionLogger?.endSession(true);
    }
  }
  if (next) beginKnownDomain(set, get);
}

/** Reuse confirmed template decisions without asking the same question again. */
function beginKnownDomain(set: Set, get: Get) {
  const s = get();
  if (s.pending || busy(s) || s.isComplete) return;
  const domain = getDomain(s.currentDomain);
  const known = domain.requiredChoiceKey && s.lockedChoices[domain.id]?.[domain.requiredChoiceKey];
  if (!known) return;
  const label = CARD_CHOICES[domain.id]?.find(o => o.id === known)?.label ?? known.replace(/^custom:/, '');
  set({ question: { text: `Using your saved decision: ${label}.`, guidance: 'This decision is already in your project context.' },
    pending: { domainId: domain.id, mode: 'document', userMessage: `Generate ${domain.label} documentation from the already confirmed decision ${label} and existing project context. Label assumptions and recommendations separately. Output only Markdown.` } });
  void execute(set, get);
}

/** All retries reuse the pending operation. They never append another user turn. */
async function execute(set: Set, get: Get, reconcile = false) {
  const s = get();
  if (!s.pending || busy(s) || !s.projectId || !s.tokenGetter || !s.lockedContext) return;
  const operation = s.pending;
  const projectId = s.projectId;
  const controller = new AbortController();
  const client = makeTRPCClient(s.tokenGetter);
  const live = () => get().projectId === projectId && get().pending === operation && get().abortController === controller;
  const fail = (type: StreamErrorType, message: string, generatedDocument?: string) => {
    if (!live()) return;
    set({ status: 'error', notice: '', lastError: { type, message }, isThinking: false, isStreaming: false, abortController: null,
      pending: generatedDocument === undefined ? get().pending : { ...operation, generatedDocument } });
  };
  set({ status: 'submitting', notice: '', isThinking: true, lastError: null, abortController: controller });
  const timeout = setTimeout(() => {
    if (!live()) return;
    fail('timeout', 'The operation was interrupted. Your answer is preserved. Please retry.');
    controller.abort();
  }, 45_000);
  try {
  // A pending operation is durably checkpointed before invoking the provider.
  try { await get().saveProgress(); }
  catch { fail('persistence', 'Your answer could not be saved. Check your connection and retry.'); return; }
  if (!live()) return;
  if (reconcile) {
    try {
      const documents = await client.documents.listByProject.query({ projectId }, { signal: controller.signal });
      if (!live()) return;
      const saved = documents.find(d => d.domainId === operation.domainId);
      if (saved && (!operation.regenerate || saved.content !== operation.previousContent)) { complete(set, get, operation, saved.content); return; }
    } catch { fail('network', 'Could not check whether this section was saved. Please retry.'); return; }
  }
  if (operation.generatedDocument !== undefined) {
    set({ status: 'saving' });
    try {
      const document = await client.documents.update.mutate({ projectId, domainId: operation.domainId, content: operation.generatedDocument }, { signal: controller.signal });
      if (live()) complete(set, get, operation, document.content);
    } catch { fail('persistence', 'Documentation could not be saved. Your answer and generated section are preserved. Please retry.'); }
    return;
  }
  const config = getActiveConfig();
  if (!config) { fail('auth', 'Configure an AI provider in Settings, then retry.'); return; }
  set({ status: operation.mode === 'document' ? 'generating' : 'preparing', isThinking: false, isStreaming: true, currentProvider: config.provider });
  const history = s.messages.slice(0, operation.mode === 'document' ? undefined : -1).slice(-12);
  if (operation.mode === 'interview' && history.at(-1)?.content !== s.question.text) {
    history.push({ role: 'assistant', content: s.question.text });
  }
    await streamAIResponse(operation.userMessage,
      { ...config, domainId: operation.domainId, persistDocument: operation.mode === 'document',
        ...(operation.mode === 'interview' ? { responseMode: 'interview' as const, followUpCount: s.followUpCount } : {}) },
      { lockedContext: s.lockedContext, lockedChoices: s.lockedChoices, elaboration: s.elaboration,
        confirmedAnswers: s.messages.filter(m => m.role === 'user' && m.domainId).slice(-30).map(m => ({ domainId: m.domainId!, answer: m.content.slice(0, 4000) })) },
      {
        onToken: () => {}, // Documents and internal protocol text never become questions.
        // Structured turns may return either a question or a document; the
        // engine cannot distinguish those until the full response is validated.
        onStatus: status => { if (live()) set({ status: status === 'generating' && operation.mode === 'interview' ? 'preparing' : status }); },
        onError: fail,
        onDone: (text, result) => {
          if (!live()) return;
          if (!text.trim() || (operation.mode === 'interview' && !result)) {
            fail('unknown', 'The assistant returned an empty or invalid response. Your answer is preserved. Please retry.'); return;
          }
          if (result?.kind === 'question') {
            if (s.followUpCount > 0) { fail('unknown', 'The assistant could not finish this section. Please retry.'); return; }
            set(state => ({ question: result.question, followUpCount: 1, draft: emptyDraft(), pending: null,
              status: 'follow_up', isThinking: false, isStreaming: false, abortController: null,
              messages: [...state.messages, { role: 'assistant', content: result.question.text, domainId: operation.domainId }] }));
            s.sessionLogger?.logAssistantMessage(result.question.text, operation.domainId, config.provider, null, { messageType: 'follow-up' });
          } else complete(set, get, operation, result?.kind === 'document' ? result.markdown : text);
        },
      }, controller.signal, history);
  } finally { clearTimeout(timeout); }
}

const initial = () => ({
  lockedContext: null, lockedChoices: {}, domainPhases: phases(), currentDomain: 'planning' as DomainId,
  completedDomains: [], domainContent: {}, documentDrafts: {}, isEditingDocuments: false,
  messages: [], elaboration: '', activeDomains: DOMAINS, projectName: '', projectId: null,
  question: mainQuestion('planning'), followUpCount: 0, draft: emptyDraft(), pending: null,
  status: 'ready' as OperationStatus, notice: '', isThinking: false, isStreaming: false, isComplete: false,
  lastError: null, currentProvider: null, abortController: null, tokenGetter: null, sessionLogger: null,
  interviewStartAt: null, domainStartAt: null,
});
export const useInterviewStore = create<InterviewState>((set, get) => ({
  ...initial(),
  setProjectName: projectName => set({ projectName }),
  setProjectId: projectId => set({ projectId }),
  setTokenGetter: tokenGetter => set({ tokenGetter }),
  refreshProvider: () => { if (!busy(get())) set({ currentProvider: getActiveConfig()?.provider ?? null }); },
  initializeSession: async tokenGetter => {
    const s = get(); const token = tokenGetter ?? s.tokenGetter;
    if (!token || !s.projectId || !s.lockedContext || s.sessionLogger) return;
    const logger = new SessionLogger(token);
    const id = await logger.startSession({ projectId: s.projectId, metadata: { ...s.lockedContext, activeDomains: s.activeDomains.map(d => d.id) } });
    if (id && get().projectId === s.projectId) set({ sessionLogger: logger });
    else if (id) void logger.endSession(false);
  },
  setLockedContext: lockedContext => {
    const activeDomains = getActiveDomains(lockedContext.projectType);
    set({ lockedContext, activeDomains, currentDomain: activeDomains[0].id, question: mainQuestion(activeDomains[0].id), interviewStartAt: Date.now(), domainStartAt: Date.now() });
    try { analytics.interviewStarted(get().projectId ?? '', ''); } catch {}
    void get().initializeSession();
  },
  setAnswerDraft: draft => { if (!busy(get()) && !get().pending) set(s => ({ draft: { ...s.draft, ...draft }, notice: '' })); },
  submitAnswer: () => {
    const s = get();
    if (busy(s) || s.pending || s.completedDomains.includes(s.currentDomain)) return;
    const option = s.question.choices?.find(o => o.id === s.draft.choice);
    if (s.question.choices && (!option || (option.requiresExplanation && !s.draft.context.trim()))) return;
    if (!s.question.choices && !s.draft.text.trim()) return;
    const answer = option ? `${option.title}${s.draft.context.trim() ? ': ' + s.draft.context.trim() : ''}` : s.draft.text.trim();
    const domain = getDomain(s.currentDomain);
    const value = option?.id === 'other' ? `custom:${s.draft.context.trim()}` : option?.id;
    const pending: Pending = { domainId: domain.id, userMessage: answer, mode: 'interview' };
    if (option?.id === 'skipped' && s.followUpCount === 0) pending.generatedDocument = `## ${domain.label}\n\n**Confirmed decision:** Deferred to a later version.\n\n${s.draft.context.trim()}`;
    set({ pending, messages: [...s.messages, { role: 'user', content: answer, domainId: domain.id }],
      elaboration: domain.id === 'planning' ? [s.elaboration, answer].filter(Boolean).join('\n').slice(0, 4000) : s.elaboration,
      lockedChoices: value && domain.requiredChoiceKey && s.followUpCount === 0 ? { ...s.lockedChoices, [domain.id]: { [domain.requiredChoiceKey]: value } } : s.lockedChoices });
    s.sessionLogger?.logUserMessage(answer, domain.id);
    void execute(set, get);
  },
  sendMessage: text => { get().setAnswerDraft({ text }); get().submitAnswer(); },
  lockDomainChoice: (domain, _key, value) => { if (domain !== get().currentDomain) return; get().setAnswerDraft({ choice: value }); get().submitAnswer(); },
  retryLast: () => { if (get().pending) void execute(set, get, true); },
  cancelStream: () => {
    const s = get(); s.abortController?.abort();
    set({ abortController: null, isThinking: false, isStreaming: false, status: 'error', lastError: { type: 'network', message: 'The operation was interrupted. Your answer is preserved. Retry to continue.' } });
  },
  setDomainContent: (domain, content) => set(s => ({ domainContent: { ...s.domainContent, [domain]: content } })),
  setDocumentDraft: (domain, content) => set(s => {
    const documentDrafts = { ...s.documentDrafts };
    if (content === undefined || content === s.domainContent[domain]) delete documentDrafts[domain]; else documentDrafts[domain] = content;
    return { documentDrafts };
  }),
  setDocumentEditing: isEditingDocuments => set({ isEditingDocuments }),
  regenerateDomain: domainId => {
    const s = get(); if (busy(s) || s.pending || Object.keys(s.documentDrafts).length) return;
    set({ pending: { domainId, mode: 'document', regenerate: true, previousContent: s.domainContent[domainId], userMessage: `Regenerate ${getDomain(domainId).label} using confirmed decisions. Separate assumptions and recommendations. Output only the replacement Markdown documentation.` } });
    void execute(set, get);
  },
  resumeFromSaved: data => {
    const activeDomains = getActiveDomains(data.lockedContext.projectType);
    // The canonical records are evidence of completion, including a save whose
    // acknowledgement was lost. Missing records can never count as completed.
    const completedDomains = activeDomains.filter(d => data.domainContent[d.id] !== undefined).map(d => d.id);
    const next = activeDomains.find(d => !completedDomains.includes(d.id));
    const workflow = data.workflow;
    const savedDomain = workflow && activeDomains.some(d => d.id === workflow.currentDomain) ? workflow.currentDomain : undefined;
    const currentDomain = savedDomain && !completedDomains.includes(savedDomain) ? savedDomain : (next?.id ?? activeDomains[activeDomains.length - 1].id);
    const sameQuestion = workflow?.currentDomain === currentDomain;
    const completed = completedDomains.includes(currentDomain);
    const candidate = workflow?.pending;
    const pending = candidate && (!completedDomains.includes(candidate.domainId) || (candidate.regenerate && data.domainContent[candidate.domainId] === candidate.previousContent)) ? candidate : null;
    const last = data.conversationHistory.at(-1);
    const legacyPending: Pending | null = !workflow && !completed && last?.role === 'user' && last.domainId === currentDomain ? { domainId: currentDomain, userMessage: last.content, mode: 'interview' } : null;
    const legacyQuestion = !workflow && !completed && last?.role === 'assistant' && last.domainId === currentDomain && !last.showCards && !last.isComplete
      ? { ...mainQuestion(currentDomain), text: last.content }
      : mainQuestion(currentDomain);
    set({ ...data, activeDomains, completedDomains, currentDomain, messages: data.conversationHistory,
      question: sameQuestion ? workflow!.question : legacyQuestion, followUpCount: sameQuestion ? workflow!.followUpCount : 0,
      draft: sameQuestion ? workflow!.draft : { ...emptyDraft(), text: legacyPending?.userMessage ?? '' }, pending: pending ?? legacyPending,
      notice: '', status: pending || legacyPending ? 'error' : completed ? 'saved' : sameQuestion && workflow?.followUpCount ? 'follow_up' : 'ready',
      lastError: pending || legacyPending ? { type: 'network', message: 'An unfinished operation was restored. Your answer is preserved. Retry to continue.' } : null,
      isComplete: !next, interviewStartAt: Date.now(), domainStartAt: Date.now(),
      domainPhases: Object.fromEntries(DOMAINS.map(d => [d.id, completedDomains.includes(d.id) ? 'complete' : d.id === currentDomain ? 'interviewing' : 'not_started'])) as Record<DomainId, DomainPhase> });
    if (!sameQuestion && !pending && !legacyPending) beginKnownDomain(set, get);
  },
  saveProgress: () => {
    const s = get(); if (!s.projectId || !s.tokenGetter || !s.lockedContext) return Promise.resolve();
    const input = { id: s.projectId, data: { status: s.isComplete ? 'complete' as const : 'in_progress' as const, interviewData: interviewSnapshot(s) } };
    const next = saveQueue.catch(() => {}).then(() => makeTRPCClient(s.tokenGetter!).projects.update.mutate(input, { signal: AbortSignal.timeout(30_000) }));
    saveQueue = next;
    return next.then(() => {});
  },
  reset: () => { get().abortController?.abort(); void get().sessionLogger?.endSession(false); set(initial()); },
}));

export function selectFullDocument(state: InterviewState): string {
  return state.lockedContext ? buildFullDocument(state.lockedContext, state.domainContent) : '';
}
