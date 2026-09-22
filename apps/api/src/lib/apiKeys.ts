import { and, eq } from 'drizzle-orm';
import type { AIProvider } from '@devdocs/shared';
import { decryptKey } from './crypto';
import { db, userApiKeys } from './db';

const models = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  metamuse: 'muse-spark-1.1',
} as const;

export async function loadDecryptedKey(userId: string, provider: AIProvider): Promise<string | null> {
  const row = await db.query.userApiKeys.findFirst({
    where: and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)),
  });
  return row ? decryptKey(row.keyHash) : null;
}

export async function verifyApiKey(provider: Exclude<AIProvider, 'bedrock'>, key: string): Promise<string | null> {
  try {
    const response = provider === 'anthropic'
      ? await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: models.anthropic, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: AbortSignal.timeout(8_000),
        })
      : provider === 'openai'
      ? await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: models.openai, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: AbortSignal.timeout(8_000),
        })
      : await fetch('https://api.meta.ai/v1/chat/completions', {
          method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: models.metamuse, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: AbortSignal.timeout(8_000),
        });
    const label = provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : 'Meta Muse';
    if (response.status === 401) return `Invalid ${label} API key.`;
    if (response.status === 429 || response.ok) return null;
    return `${label} API error ${response.status}.`;
  } catch {
    return 'Network error while verifying the API key.';
  }
}
