import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { appRouter } from '../router';
import { createTestUser } from '../../test/helpers';
import { db, userApiKeys } from '../../lib/db';
import { decryptKey } from '../../lib/crypto';

describe('key vault with real PostgreSQL and isolated provider verification', () => {
  let owner: ReturnType<typeof appRouter.createCaller>;
  let other: ReturnType<typeof appRouter.createCaller>;
  let userId: string;
  const key = 'sk-ant-fake-test-key-never-a-real-secret-1234567890';
  beforeEach(async () => {
    const user = await createTestUser(`keys-${crypto.randomUUID()}@example.test`);
    const outsider = await createTestUser(`other-${crypto.randomUUID()}@example.test`);
    userId = user.id;
    owner = appRouter.createCaller({ userId: user.id, userEmail: user.email });
    other = appRouter.createCaller({ userId: outsider.id, userEmail: outsider.email });
    vi.stubEnv('ENCRYPTION_KEY', 'a'.repeat(64));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it.each(['anthropic', 'openai', 'metamuse'] as const)('encrypts %s and returns only a masked key', async provider => {
    const result = await owner.keys.upsert({ provider, key });
    expect(result.maskedKey).not.toContain(key);
    const [stored] = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId));
    expect(stored.keyHash).not.toContain(key);
    expect(decryptKey(stored.keyHash)).toBe(key);
    const listed = await owner.keys.list();
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toMatch(/keyHash|ciphertext/);
    expect(await other.keys.list()).toEqual([]);
    await other.keys.delete({ provider });
    expect(await owner.keys.list()).toHaveLength(1);
    await owner.keys.delete({ provider });
    expect(await owner.keys.list()).toEqual([]);
  });
  it('rotates a key without duplicate vault rows', async () => {
    await owner.keys.upsert({ provider: 'anthropic', key });
    const replacement = key + '-replacement';
    await owner.keys.upsert({ provider: 'anthropic', key: replacement });
    const rows = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId));
    expect(rows).toHaveLength(1);
    expect(decryptKey(rows[0].keyHash)).toBe(replacement);
  });
  it.each([401, 403, 500])('preserves the existing key on provider HTTP %s', async status => {
    await owner.keys.upsert({ provider: 'anthropic', key });
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status }));
    await expect(owner.keys.upsert({ provider: 'anthropic', key: key + '-bad' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const [stored] = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId));
    expect(decryptKey(stored.keyHash)).toBe(key);
  });
  it('reports provider network failure without storing a key', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unavailable'));
    await expect(owner.keys.upsert({ provider: 'openai', key })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await owner.keys.list()).toEqual([]);
  });
});
