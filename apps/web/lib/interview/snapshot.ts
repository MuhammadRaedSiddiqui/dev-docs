import { DomainIdSchema, ProjectContextSchema, InterviewWorkflowSchema, type InterviewWorkflow } from '@devdocs/shared';
import type { ChatMessage, DomainId, ProjectContext } from '../types';

export interface SavedInterviewData {
  lockedContext: ProjectContext;
  lockedChoices: Partial<Record<DomainId, Record<string, string>>>;
  completedDomains: DomainId[];
  domainContent: Partial<Record<DomainId, string>>;
  conversationHistory: ChatMessage[];
  elaboration: string;
  workflow?: InterviewWorkflow;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Old clients stored loosely typed JSON. Recover valid fields individually. */
export function readSavedInterviewData(value: unknown): SavedInterviewData | null {
  if (!record(value)) return null;
  const context = ProjectContextSchema.safeParse(value.lockedContext);
  if (!context.success) return null;
  const content: SavedInterviewData['domainContent'] = {};
  const choices: SavedInterviewData['lockedChoices'] = {};
  for (const [id, body] of Object.entries(record(value.domainContent) ? value.domainContent : {})) {
    const domain = DomainIdSchema.safeParse(id);
    if (domain.success && typeof body === 'string') content[domain.data] = body;
  }
  for (const [id, choice] of Object.entries(record(value.lockedChoices) ? value.lockedChoices : {})) {
    const domain = DomainIdSchema.safeParse(id);
    if (domain.success && record(choice)) choices[domain.data] = Object.fromEntries(Object.entries(choice).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  }
  const completed = (Array.isArray(value.completedDomains) ? value.completedDomains : []).flatMap(id => {
    const domain = DomainIdSchema.safeParse(id); return domain.success ? [domain.data] : [];
  });
  const messages: ChatMessage[] = (Array.isArray(value.conversationHistory) ? value.conversationHistory : []).flatMap(message => {
    if (!record(message) || !['user', 'assistant'].includes(String(message.role)) || typeof message.content !== 'string') return [];
    const clean: ChatMessage = { role: message.role as ChatMessage['role'], content: message.content };
    for (const field of ['showCards', 'domainId'] as const) {
      const domain = DomainIdSchema.safeParse(message[field]); if (domain.success) clean[field] = domain.data;
    }
    if (typeof message.isComplete === 'boolean') clean.isComplete = message.isComplete;
    if (typeof message.showDownload === 'boolean') clean.showDownload = message.showDownload;
    return [clean];
  });
  const workflow = InterviewWorkflowSchema.safeParse(value.workflow);
  return { lockedContext: context.data, lockedChoices: choices, completedDomains: [...new Set(completed)], domainContent: content, conversationHistory: messages, elaboration: typeof value.elaboration === 'string' ? value.elaboration : '', ...(workflow.success ? { workflow: workflow.data } : {}) };
}
