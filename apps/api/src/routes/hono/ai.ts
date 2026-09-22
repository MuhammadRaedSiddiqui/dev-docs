import { Hono } from 'hono';
import { and, eq, isNull } from 'drizzle-orm';
import { StreamRequestSchema, buildSystemPrompt, PROVIDER_MODELS, type AIProvider } from '@devdocs/shared';
import { db, documentationBundles, projects } from '../../lib/db';
import { streamAIResponse } from '../../lib/aiStream';
import { checkRateLimit } from '../../lib/rateLimit';
import { requireClerkAuth } from '../../middleware/hono-clerk-auth';
import { loadDecryptedKey } from '../../lib/apiKeys';

const models: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  bedrock: process.env.AWS_BEDROCK_MODEL ?? PROVIDER_MODELS.bedrock.default,
  metamuse: 'muse-spark-1.1',
};

// Per-user/provider AI generation limit: 20 requests per minute.
const AI_RATE_LIMIT = 20;
const AI_RATE_WINDOW_SEC = 60;

const app = new Hono();

app.get('/bedrock-status', (c) => {
  const configured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  return c.json({
    configured,
    region: configured ? (process.env.AWS_REGION ?? 'us-east-1') : null,
    model: configured ? (process.env.AWS_BEDROCK_MODEL ?? PROVIDER_MODELS.bedrock.default) : null,
  });
});

app.use('*', requireClerkAuth);

app.post('/stream', async (c) => {
  const parsed = StreamRequestSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'validation_error', fields: parsed.error.flatten().fieldErrors }, 400);
  const { projectId, domainId, userMessage, provider, history } = parsed.data;
  const userId = c.get('userId');
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId), isNull(projects.deletedAt)),
  });
  if (!project) return c.json({ error: 'not_found', message: 'Project not found.' }, 404);

  let interview = parsed.data.interview as
    | { lockedContext: Parameters<typeof buildSystemPrompt>[0]; lockedChoices: Parameters<typeof buildSystemPrompt>[3]; elaboration: string }
    | undefined;
  // Backward-compat: older web builds omit `interview` — fall back to DB.
  if (!interview) {
    const raw = (project.interviewData ?? {}) as Record<string, unknown>;
    if (!raw.lockedContext) {
      return c.json({ error: 'validation_error', message: 'Interview context missing. Please refresh and restart the interview step.' }, 400);
    }
    interview = {
      lockedContext: raw.lockedContext as Parameters<typeof buildSystemPrompt>[0],
      lockedChoices: (raw.lockedChoices as Parameters<typeof buildSystemPrompt>[3]) ?? {},
      elaboration: (raw.elaboration as string) ?? '',
    };
  }

  // Per-user/provider rate limit — applied after ownership is confirmed so that
  // unauthorized probes don't consume a legitimate user's budget.
  const limit = await checkRateLimit(`ai:stream:${userId}:${provider}`, AI_RATE_LIMIT, AI_RATE_WINDOW_SEC);
  if (!limit.allowed) {
    return c.json(
      { error: 'rate_limit', message: `Rate limit reached. Try again in ${limit.resetIn}s.` },
      429,
      { 'retry-after': String(limit.resetIn) }
    );
  }

  let apiKey: string;
  let model: string;
  if (provider === "bedrock") {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return c.json({ error: 'bedrock_not_configured', message: 'Amazon Bedrock is not configured on this server.' }, 400);
    }
    apiKey = "bedrock-env";
    model = models.bedrock;
  } else {
    const key = await loadDecryptedKey(userId, provider);
    if (!key) return c.json({ error: 'no_key', message: `No ${provider} API key found.` }, 400);
    apiKey = key;
    model = models[provider];
  }
  const encoder = new TextEncoder();
  const abort = new AbortController();
  c.req.raw.signal.addEventListener('abort', () => abort.abort(), { once: true });
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const close = () => { if (!closed) { closed = true; controller.close(); } };
      const timeout = setTimeout(() => { abort.abort(); send({ type: 'error', errorType: 'timeout', message: 'Request timed out after 30 seconds.' }); close(); }, 30_000);
      const prompt = buildSystemPrompt(
        interview.lockedContext,
        domainId,
        interview.elaboration,
        interview.lockedChoices,
      );
      streamAIResponse(prompt, userMessage, {
        provider,
        apiKey,
        model,
      }, {
        onToken: (text) => send({ type: 'token', text }),
        onDone: async (text) => {
          try {
            await db.insert(documentationBundles).values({ projectId, domainId, content: text }).onConflictDoUpdate({
              target: [documentationBundles.projectId, documentationBundles.domainId],
              set: { content: text, updatedAt: new Date() },
            });
            clearTimeout(timeout);
            send({ type: 'done', text });
            close();
          } catch {
            clearTimeout(timeout);
            send({
              type: 'error',
              errorType: 'persistence',
              message: 'The response was generated but could not be saved. Please retry.',
            });
            close();
          }
        },
        onError: (errorType, message) => { clearTimeout(timeout); send({ type: 'error', errorType, message }); close(); },
      }, abort.signal, history);
    },
    cancel: () => abort.abort(),
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' } });
});

export default app;
