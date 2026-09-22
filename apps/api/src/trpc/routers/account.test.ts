import { beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  documentationBundles,
  interviewMessages,
  interviewSessions,
  projects,
  userApiKeys,
  users,
} from '../../lib/db';
import { createTestUser } from '../../test/helpers';
import { appRouter } from '../router';

describe('account router', () => {
  let userId: string;
  let userEmail: string;

  beforeEach(async () => {
    userEmail = `export-${Date.now()}-${Math.random()}@example.com`;
    const user = await createTestUser(userEmail);
    userId = user.id;
  });

  it('exports owned data without API-key secrets', async () => {
    const [project] = await db.insert(projects).values({
      userId,
      name: 'Export me',
      type: 'saas',
    }).returning();
    await db.insert(documentationBundles).values({
      projectId: project.id,
      domainId: 'planning',
      content: '# Plan',
    });
    const [session] = await db.insert(interviewSessions).values({
      projectId: project.id,
      userId,
    }).returning();
    await db.insert(interviewMessages).values({
      sessionId: session.id,
      role: 'user',
      content: 'My answer',
      domainId: 'planning',
    });
    await db.insert(userApiKeys).values({
      userId,
      provider: 'openai',
      keyHash: 'encrypted-secret-that-must-not-leak',
      maskedKey: 'sk-...1234',
    });

    const caller = appRouter.createCaller({ userId, userEmail });
    const exported = await caller.account.exportData();

    expect(exported.account.email).toBe(userEmail);
    expect(exported.projects).toHaveLength(1);
    expect(exported.documents[0]?.content).toBe('# Plan');
    expect(exported.interviewMessages[0]?.content).toBe('My answer');
    expect(exported.apiKeyConnections[0]).toMatchObject({
      provider: 'openai',
      maskedKey: 'sk-...1234',
    });
    expect(JSON.stringify(exported)).not.toContain('encrypted-secret-that-must-not-leak');
  });

  it('deletes the local account and all owned data', async () => {
    await db.insert(projects).values({ userId, name: 'Delete me', type: 'saas' });
    const caller = appRouter.createCaller({ userId, userEmail });

    await expect(caller.account.deleteData({ confirmation: 'DELETE' }))
      .resolves.toEqual({ success: true });

    expect(await db.query.users.findFirst({ where: (table, { eq }) => eq(table.id, userId) }))
      .toBeUndefined();
    expect(await db.query.projects.findMany({ where: (table, { eq }) => eq(table.userId, userId) }))
      .toEqual([]);
  });
});
