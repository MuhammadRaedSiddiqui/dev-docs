import { beforeEach, describe, expect, it, vi } from 'vitest';
import { META_MUSE_MAX_COMPLETION_TOKENS, type AIProvider } from '@devdocs/shared';

const mock = vi.hoisted(() => ({ create: vi.fn(), stream: vi.fn(), config: vi.fn() }));
vi.mock('openai', () => ({ default: class {
  constructor(config: unknown) { mock.config(config); }
  chat = { completions: { create: mock.create } };
} }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { stream: mock.stream }; } }));
vi.mock('@anthropic-ai/bedrock-sdk', () => ({ AnthropicBedrock: class { messages = { stream: mock.stream }; } }));
import { streamAIResponse } from './aiStream';

function streams(reason = 'stop') {
  mock.create.mockResolvedValue((async function* () {
    yield { choices: [{ delta: { content: 'First ' }, finish_reason: null }] };
    yield { choices: [{ delta: { content: 'second' }, finish_reason: reason }] };
  })());
  let onText: (text: string) => void;
  mock.stream.mockReturnValue({
    on: (_event: string, handler: typeof onText) => { onText = handler; },
    finalMessage: async () => {
      onText('First '); onText('second');
      return { stop_reason: reason === 'stop' ? 'end_turn' : 'max_tokens' };
    },
  });
}
beforeEach(() => { vi.clearAllMocks(); streams(); });

describe.each(['anthropic', 'openai', 'metamuse', 'bedrock'] as AIProvider[])('%s provider adapter', provider => {
  const config = { provider, apiKey: 'fake-key', model: 'test-model' };
  it('streams deltas, forwards cancellation, and deduplicates bounded history', async () => {
    const callbacks = { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    const abort = new AbortController();
    const history = Array.from({ length: 10 }, (_, index) => ({ role: 'user' as const, content: index === 9 ? 'Question' : `history ${index}` }));
    streamAIResponse('System', 'Question', config, callbacks, abort.signal, history);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalledWith('First second'));
    expect(callbacks.onToken.mock.calls.flat()).toEqual(['First ', 'second']);
    expect(callbacks.onError).not.toHaveBeenCalled();
    const call = (provider === 'anthropic' || provider === 'bedrock' ? mock.stream : mock.create).mock.calls[0];
    expect(call[1].signal).toBe(abort.signal);
    const messages = call[0].messages.filter((m: any) => m.role !== 'system');
    expect(messages).toHaveLength(6);
    expect(messages.filter((m: any) => m.content === 'Question')).toHaveLength(1);
    if (provider === 'metamuse') expect(mock.config).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'https://api.meta.ai/v1' }));
  });
  it('does not report truncated output as successful documentation', async () => {
    streams('length');
    const callbacks = { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    streamAIResponse('System', 'Question', config, callbacks);
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith('unknown', expect.stringContaining('incomplete')));
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });
  it.each([
    ['401 authentication AccessDenied', 'auth'],
    ['429 rate ThrottlingException', 'rate_limit'],
    ['unexpected provider failure', 'unknown'],
  ])('maps provider error %s to %s', async (message, type) => {
    mock.create.mockRejectedValue(new Error(message));
    mock.stream.mockImplementation(() => { throw new Error(message); });
    const callbacks = { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    streamAIResponse('System', 'Question', config, callbacks);
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith(type, expect.any(String)));
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });
});

describe('Meta Muse reasoning budget', () => {
  it('reports unavailable model access without exposing raw provider error details or completing', async () => {
    mock.create.mockRejectedValue(Object.assign(new Error('The requested model was not found. private-provider-details'), { status: 404 }));
    const callbacks = { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    streamAIResponse('System', 'Question', { provider: 'metamuse', apiKey: 'fake-key', model: 'muse-spark-1.1' }, callbacks);
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith('model_unavailable', expect.stringContaining('Enable Muse Spark access')));
    expect(callbacks.onError.mock.calls[0][1]).not.toContain('private-provider-details');
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });
  it('reserves reasoning room and handles a terminal usage-only chunk', async () => {
    mock.create.mockResolvedValue((async function* () {
      yield { choices: [{ delta: { content: 'Complete answer' }, finish_reason: 'stop' }] };
      yield { choices: [], usage: { prompt_tokens: 100, completion_tokens: 700, completion_tokens_details: { reasoning_tokens: 500 } } };
    })());
    const callbacks = { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    streamAIResponse('System', 'Question', { provider: 'metamuse', apiKey: 'fake-key', model: 'test-model' }, callbacks);
    await vi.waitFor(() => expect(callbacks.onDone).toHaveBeenCalledWith('Complete answer'));
    expect(mock.create.mock.calls[0][0]).toMatchObject({ max_completion_tokens: META_MUSE_MAX_COMPLETION_TOKENS, reasoning_effort: 'low', stream_options: { include_usage: true } });
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
  it('rejects a natural stop with no visible text', async () => {
    mock.create.mockResolvedValue((async function* () {
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
    })());
    const callbacks = { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() };
    streamAIResponse('System', 'Question', { provider: 'metamuse', apiKey: 'fake-key', model: 'test-model' }, callbacks);
    await vi.waitFor(() => expect(callbacks.onError).toHaveBeenCalledWith('unknown', expect.stringContaining('empty response')));
    expect(callbacks.onDone).not.toHaveBeenCalled();
  });
});
