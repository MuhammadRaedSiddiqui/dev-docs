/// <reference lib="dom" />
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { streamAIResponse } from '../../../web/lib/ai/stream';
import { StreamRequestSchema } from '@devdocs/shared';

const callbacks = { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
const config = { projectId: 'project', provider: 'anthropic' as const, domainId: 'planning' as const, getToken: async () => 'fake-session' };
const interview = { lockedContext: { projectType: 'saas' as const, teamSize: 'solo' as const, timeline: 'under_1_month' as const, budget: 'bootstrapped' as const, experienceLevel: 'beginner' as const }, lockedChoices: {}, elaboration: '' };
function respond(chunks: string[] | Uint8Array[]) {
  const encoder = new TextEncoder();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(controller) {
    for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
    controller.close();
  } }), { headers: { 'content-type': 'text/event-stream' } })));
}
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());
it('reassembles split UTF-8 characters, CRLF frames and final frame without newline', async () => {
  const bytes = new TextEncoder().encode('data: {"type":"token","text":"café 🔐"}\r\n\r\ndata: {"type":"done","text":"café 🔐"}');
  respond(Array.from(bytes, byte => new Uint8Array([byte])));
  await streamAIResponse('question', config, interview, callbacks);
  expect(callbacks.onDone).toHaveBeenCalledWith('café 🔐'); expect(callbacks.onError).not.toHaveBeenCalled();
});
it('accumulates deltas and ignores terminal duplicates', async () => {
  respond(['data: {"type":"token","text":"one"}\n\ndata: {"type":"token","text":"two"}\n\ndata: {"type":"done","text":"onetwo"}\n\ndata: {"type":"done","text":"duplicate"}\n\n']);
  await streamAIResponse('question', config, interview, callbacks);
  expect(callbacks.onToken.mock.calls).toEqual([['one'], ['onetwo']]); expect(callbacks.onDone).toHaveBeenCalledOnce();
});
it('preserves unavailable model errors through SSE without producing false completion', async () => {
  respond(['data: {"type":"error","errorType":"model_unavailable","message":"Enable Muse Spark access"}\n\ndata: {"type":"done","text":"must not complete"}\n\n']);
  await streamAIResponse('question', config, interview, callbacks);
  expect(callbacks.onError).toHaveBeenCalledWith('model_unavailable', 'Enable Muse Spark access');
  expect(callbacks.onError).toHaveBeenCalledOnce();
  expect(callbacks.onDone).not.toHaveBeenCalled();
});
it.each(['data: bad\n\n', 'data: {"type":"token","text":42}\n\n', 'data: {"type":"token","text":"partial"}\n\n'])('rejects malformed or incomplete stream', async chunk => {
  respond([chunk]); await streamAIResponse('question', config, interview, callbacks);
  expect(callbacks.onError).toHaveBeenCalledOnce(); expect(callbacks.onDone).not.toHaveBeenCalled();
});
it.each([[401, 'auth'], [429, 'rate_limit'], [500, 'unknown']])('maps HTTP %i errors', async (status, type) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Unavailable' }), { status: Number(status) })));
  await streamAIResponse('question', config, interview, callbacks); expect(callbacks.onError).toHaveBeenCalledWith(type, 'Unavailable');
});
it('treats intentional abort as cancellation', async () => {
  const controller = new AbortController(); controller.abort();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
  await streamAIResponse('question', config, interview, callbacks, controller.signal);
  expect(callbacks.onError).not.toHaveBeenCalled(); expect(callbacks.onDone).not.toHaveBeenCalled();
});

it('drains a completed stream without cancelling the successful request', async () => {
  const cancel = vi.fn();
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
    pull(controller) {
      if (reads++ === 0) controller.enqueue(new TextEncoder().encode('data: {"type":"done","text":"Saved"}\n\n'));
      else controller.close();
    }, cancel,
  }))));
  await streamAIResponse('question', config, interview, callbacks);
  expect(callbacks.onDone).toHaveBeenCalledWith('Saved');
  expect(callbacks.onError).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  expect(reads).toBe(2);
});

it('bounds recent history so long generated documents do not invalidate the next request', async () => {
  respond(['data: {"type":"done","text":"Reply"}\n\n']);
  const history = Array.from({ length: 10 }, () => ({ role: 'assistant' as const, content: 'x'.repeat(8000) }));
  await streamAIResponse('question', config, interview, callbacks, undefined, history);
  const requestBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(requestBody.history).toHaveLength(10);
  expect(StreamRequestSchema.shape.history.safeParse(requestBody.history).success).toBe(true);
  expect(history[0].content).toHaveLength(8000);
});
