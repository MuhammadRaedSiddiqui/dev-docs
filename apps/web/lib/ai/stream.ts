import type { AIProviderConfig } from '@/lib/ai/provider';
import type { DomainId, ProjectContext } from '@/lib/types';

export type StreamErrorType = 'auth' | 'rate_limit' | 'timeout' | 'network' | 'persistence' | 'unknown';
export interface StreamCallbacks { onToken: (text: string) => void; onDone: (text: string) => void; onError: (type: StreamErrorType, message: string) => void; }
export interface InterviewSnapshot {
  lockedContext: ProjectContext;
  lockedChoices: Partial<Record<DomainId, Record<string, string>>>;
  elaboration: string;
}

export async function streamAIResponse(
  userMessage: string,
  config: AIProviderConfig & { domainId: DomainId },
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
        interview,
        history: history?.slice(-6),
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
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n'); buffer = events.pop() ?? '';
      for (const event of events) {
        if (terminal) continue;
        const line = event.split('\n').find(x => x.startsWith('data: ')); if (!line) continue;
        const data = JSON.parse(line.slice(6)) as { type: string; text?: string; errorType?: StreamErrorType; message?: string };
        if (data.type === 'token' && data.text) {
          accumulated += data.text;
          callbacks.onToken(accumulated);
        }
        if (data.type === 'done') {
          terminal = true;
          callbacks.onDone(data.text ?? accumulated);
        }
        if (data.type === 'error') {
          terminal = true;
          callbacks.onError(data.errorType ?? 'unknown', data.message ?? 'AI generation failed.');
        }
      }
    }
    if (!terminal) {
      callbacks.onError('network', 'The AI connection closed before generation completed. Please retry.');
    }
  } catch (error) {
    if (signal?.aborted) return;
    callbacks.onError('network', error instanceof Error ? error.message : 'Network error.');
  }
}
