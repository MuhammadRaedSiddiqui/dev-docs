// apps/api/src/lib/aiStream.ts
// Server-side AI streaming — identical interface to the browser version
// but without dangerouslyAllowBrowser. Runs inside the Hono process.
import { META_MUSE_MAX_COMPLETION_TOKENS, type AIProvider } from "@devdocs/shared";
import { logger } from './logger';

export interface AIConfig {
  provider: AIProvider;
  apiKey:   string;
  model:    string;
}

export interface StreamCallbacks {
  onToken: (delta: string) => void;
  onDone:  (fullText: string) => void | Promise<void>;
  onError: (type: string, message: string) => void;
}

export function streamAIResponse(
  systemPrompt: string,
  userMessage:  string,
  config:       AIConfig,
  callbacks:    StreamCallbacks,
  signal?:      AbortSignal,
  history?:     { role: "user" | "assistant"; content: string }[],
): void {
  const hist = (history ?? []).slice(-6);
  if (config.provider === "anthropic") {
    streamAnthropic(systemPrompt, userMessage, config, callbacks, signal, hist);
  } else if (config.provider === "bedrock") {
    streamBedrock(systemPrompt, userMessage, config, callbacks, signal, hist);
  } else if (config.provider === "metamuse") {
    streamMetaMuse(systemPrompt, userMessage, config, callbacks, signal, hist);
  } else {
    streamOpenAI(systemPrompt, userMessage, config, callbacks, signal, hist);
  }
}

function buildAnthropicMessages(
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
): { role: "user" | "assistant"; content: string }[] {
  const base = [...history];
  // Dedupe if history already ends with this userMessage
  if (base.length && base[base.length - 1].role === "user" && base[base.length - 1].content === userMessage) {
    return base;
  }
  return [...base, { role: "user" as const, content: userMessage }];
}

function buildOpenAIMessages(
  systemPrompt: string,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const hist = [...history];
  if (hist.length && hist[hist.length - 1].role === "user" && hist[hist.length - 1].content === userMessage) {
    return [{ role: "system" as const, content: systemPrompt }, ...hist];
  }
  return [{ role: "system" as const, content: systemPrompt }, ...hist, { role: "user" as const, content: userMessage }];
}

async function streamAnthropic(
  systemPrompt: string,
  userMessage:  string,
  config:       AIConfig,
  callbacks:    StreamCallbacks,
  signal?:      AbortSignal,
  history:      { role: "user" | "assistant"; content: string }[] = [],
) {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client    = new Anthropic({ apiKey: config.apiKey });
    let   accumulated = "";

    const stream = client.messages.stream(
      {
        model:      config.model,
        max_tokens: 2000,
        system:     systemPrompt,
        messages:   buildAnthropicMessages(history, userMessage),
      },
      { signal }
    );

    stream.on("text", delta => {
      accumulated += delta;
      callbacks.onToken(delta);
    });

    const final = await stream.finalMessage();
    if (final.stop_reason !== 'end_turn' && final.stop_reason !== 'stop_sequence') {
      callbacks.onError('unknown', 'The AI response was incomplete. Please retry with a narrower request.');
      return;
    }
    await callbacks.onDone(accumulated);
  } catch (err: unknown) {
    if (isAbort(err)) return;
    callbacks.onError(...mapAnthropicError(err));
  }
}

async function streamOpenAI(
  systemPrompt: string,
  userMessage:  string,
  config:       AIConfig,
  callbacks:    StreamCallbacks,
  signal?:      AbortSignal,
  history:      { role: "user" | "assistant"; content: string }[] = [],
) {
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey: config.apiKey });
    let   accumulated = "";

    let finishReason: string | null = null;
    const stream = await client.chat.completions.create(
      {
        model:      config.model,
        max_tokens: 2000,
        stream:     true,
        messages: buildOpenAIMessages(systemPrompt, history, userMessage),
      },
      { signal }
    );

    for await (const chunk of stream) {
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        accumulated += delta;
        callbacks.onToken(delta);
      }
    }

    if (finishReason !== 'stop') {
      callbacks.onError('unknown', 'The AI response was incomplete. Please retry with a narrower request.');
      return;
    }
    await callbacks.onDone(accumulated);
  } catch (err: unknown) {
    if (isAbort(err)) return;
    callbacks.onError(...mapOpenAIError(err));
  }
}

async function streamMetaMuse(
  systemPrompt: string,
  userMessage:  string,
  config:       AIConfig,
  callbacks:    StreamCallbacks,
  signal?:      AbortSignal,
  history:      { role: "user" | "assistant"; content: string }[] = [],
) {
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: "https://api.meta.ai/v1",
    });
    let accumulated = "";

    let finishReason: string | null = null;
    let usage: { promptTokens?: number; completionTokens?: number; reasoningTokens?: number } = {};
    const stream = await client.chat.completions.create(
      {
        model:      config.model,
        max_completion_tokens: META_MUSE_MAX_COMPLETION_TOKENS,
        reasoning_effort: 'low',
        stream_options: { include_usage: true },
        stream:     true,
        messages: buildOpenAIMessages(systemPrompt, history, userMessage),
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (chunk.usage) usage = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens,
      };
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        accumulated += delta;
        callbacks.onToken(delta);
      }
    }

    logger.info({ provider: 'metamuse', model: config.model, finishReason, contentChars: accumulated.length, ...usage }, 'Meta Muse stream completed');
    if (finishReason !== 'stop') {
      callbacks.onError('unknown', 'The AI response was incomplete. Please retry with a narrower request.');
      return;
    }
    if (!accumulated.trim()) {
      callbacks.onError('unknown', 'Meta Muse returned an empty response. Please retry.');
      return;
    }
    await callbacks.onDone(accumulated);
  } catch (err: unknown) {
    if (isAbort(err)) return;
    callbacks.onError(...mapMetaMuseError(err));
  }
}

async function streamBedrock(
  systemPrompt: string,
  userMessage:  string,
  config:       AIConfig,
  callbacks:    StreamCallbacks,
  signal?:      AbortSignal,
  history:      { role: "user" | "assistant"; content: string }[] = [],
) {
  try {
    const { AnthropicBedrock } = await import("@anthropic-ai/bedrock-sdk");
    const client = new AnthropicBedrock({
      awsAccessKey:  process.env.AWS_ACCESS_KEY_ID!,
      awsSecretKey:  process.env.AWS_SECRET_ACCESS_KEY!,
      awsRegion:     process.env.AWS_REGION ?? "us-east-1",
    });
    let accumulated = "";

    const stream = client.messages.stream(
      {
        model:      config.model,
        max_tokens: 2000,
        system:     systemPrompt,
        messages:   buildAnthropicMessages(history, userMessage),
      },
      { signal }
    );

    stream.on("text", (delta: string) => {
      accumulated += delta;
      callbacks.onToken(delta);
    });

    const final = await stream.finalMessage();
    if (final.stop_reason !== 'end_turn' && final.stop_reason !== 'stop_sequence') {
      callbacks.onError('unknown', 'The AI response was incomplete. Please retry with a narrower request.');
      return;
    }
    await callbacks.onDone(accumulated);
  } catch (err: unknown) {
    if (isAbort(err)) return;
    callbacks.onError(...mapBedrockError(err));
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
}

type ErrorTuple = [string, string];

function mapAnthropicError(err: unknown): ErrorTuple {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("401") || msg.includes("authentication"))
    return ["auth",       "Anthropic API key invalid or revoked."];
  if (msg.includes("429") || msg.includes("rate"))
    return ["rate_limit", "Anthropic rate limit reached. Wait and retry."];
  if (msg.includes("fetch") || msg.includes("network"))
    return ["network",    "Network error reaching Anthropic."];
  return ["unknown", `Anthropic error: ${msg}`];
}

function mapOpenAIError(err: unknown): ErrorTuple {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("401") || msg.includes("Incorrect API key"))
    return ["auth",       "OpenAI API key invalid or revoked."];
  if (msg.includes("429") || msg.includes("rate"))
    return ["rate_limit", "OpenAI rate limit reached. Wait and retry."];
  if (msg.includes("fetch") || msg.includes("network"))
    return ["network",    "Network error reaching OpenAI."];
  return ["unknown", `OpenAI error: ${msg}`];
}

function mapBedrockError(err: unknown): ErrorTuple {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("AccessDenied") || msg.includes("UnrecognizedClientException"))
    return ["auth",       "AWS credentials invalid or Bedrock access not enabled for this model."];
  if (msg.includes("ThrottlingException") || msg.includes("TooManyRequests"))
    return ["rate_limit", "Bedrock rate limit reached. Wait a moment and try again."];
  if (msg.includes("ValidationException") && msg.includes("model"))
    return ["unknown",    "Model not available. Enable it in the AWS Bedrock console."];
  return ["unknown", `Bedrock error: ${msg}`];
}

function mapMetaMuseError(err: unknown): ErrorTuple {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: number } | null)?.status;
  if (status === 404 || /^404\b/.test(msg))
    return ["model_unavailable", "The Meta Muse text model is unavailable for this API key. Enable Muse Spark access in your Meta developer project, then retry, or choose another configured provider in Settings."];
  if (msg.includes("401") || msg.includes("Incorrect API key"))
    return ["auth",       "Meta Muse API key invalid or revoked."];
  if (msg.includes("429") || msg.includes("rate"))
    return ["rate_limit", "Meta Muse rate limit reached. Wait and retry."];
  if (msg.includes("fetch") || msg.includes("network"))
    return ["network",    "Network error reaching Meta Muse."];
  return ["unknown", `Meta Muse error: ${msg}`];
}
