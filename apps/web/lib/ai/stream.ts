import type { AIProviderConfig } from './provider';
import type { DomainId, ProjectContext } from '../types';
import { MAX_HISTORY_MESSAGE_CHARS, StreamEventSchema, type InterviewTurn } from '@devdocs/shared';

export type StreamErrorType = 'auth' | 'rate_limit' | 'timeout' | 'network' | 'persistence' | 'model_unavailable' | 'unknown';
export interface StreamCallbacks {
  onToken: (text: string) => void;
  onDone: (text: string, result?: InterviewTurn) => void;
  onError: (type: StreamErrorType, message: string, generatedDocument?: string) => void;
  onStatus?: (status: 'generating' | 'saving') => void;
}
export interface InterviewSnapshot {
  lockedContext: ProjectContext;
  lockedChoices: Partial<Record<DomainId, Record<string, string>>>;
  elaboration: string;
  confirmedAnswers?: { domainId: DomainId; answer: string }[];
}

export async function streamAIResponse(
  userMessage: string,
  config: AIProviderConfig & { domainId: DomainId; persistDocument?: boolean; responseMode?: 'interview'; followUpCount?: number },
  interview: InterviewSnapshot,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  history?: { role: "user" | "assistant"; content: string }[],
): Promise<void> {
  try {
    const token = await config.getToken();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/ai/stream`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({
        projectId: config.projectId,
        domainId: config.domainId,
        userMessage,
        provider: config.provider,
        persistDocument: config.persistDocument ?? false,
        responseMode: config.responseMode,
        followUpCount: config.followUpCount,
        interview,
        history: history?.slice(-12).map(message => ({ ...message, content: message.content.slice(0, MAX_HISTORY_MESSAGE_CHARS) })),
      }),
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      const msg = payload?.message ?? 'Unable to start AI generation.';
      if (response.status === 401) { callbacks.onError('auth', msg); return; }
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const suffix = retryAfter ? ` Try again in ${retryAfter}s.` : '';
        callbacks.onError('rate_limit', `${msg}${suffix}`); return;
      }
      callbacks.onError('unknown', msg); return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let terminal = false;
    let ended = false;
    const consume = (event: string) => {
        if (terminal) return;
        const lines = event.split(/\r?\n/).filter(x => x.startsWith('data:'));
        if (!lines.length) return;
        const data = StreamEventSchema.parse(JSON.parse(lines.map(line => line.slice(5).trimStart()).join('\n')));
        if (data.type === 'token' && data.text) {
          accumulated += data.text;
          callbacks.onToken(accumulated);
        }
        if (data.type === 'done') {
          terminal = true;
          if (data.result) callbacks.onDone(data.text, data.result);
          else callbacks.onDone(data.text);
        }
        if (data.type === 'status') callbacks.onStatus?.(data.status);
        if (data.type === 'error') {
          terminal = true;
          const known = ['auth', 'rate_limit', 'timeout', 'network', 'persistence', 'model_unavailable', 'unknown'];
          const type = known.includes(data.errorType) ? data.errorType as StreamErrorType : 'unknown';
          if (data.generatedDocument !== undefined) callbacks.onError(type, data.message, data.generatedDocument);
          else callbacks.onError(type, data.message);
        }
    };
    try {
      // The API closes immediately after its terminal event. Drain that close
      // instead of cancelling a successful fetch and reporting ERR_ABORTED.
      while (true) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/); buffer = events.pop() ?? '';
        for (const event of events) consume(event);
        if (done) { ended = true; if (buffer.trim()) consume(buffer); break; }
      }
    } finally {
      if (!ended) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (!terminal) {
      callbacks.onError('network', 'The AI connection closed before generation completed. Please retry.');
    }
  } catch (error) {
    if (signal?.aborted) return;
    callbacks.onError('network', error instanceof Error ? error.message : 'Network error.');
  }
}
