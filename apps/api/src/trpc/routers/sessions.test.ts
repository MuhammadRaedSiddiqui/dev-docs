import { beforeEach, describe, expect, it } from 'vitest';
import { db, projects } from '../../lib/db';
import { createTestUser } from '../../test/helpers';
import { appRouter } from '../router';

describe('sessions router', () => {
  let userId: string;
  let userEmail: string;
  let projectId: string;

  beforeEach(async () => {
    userEmail = `sessions-${Date.now()}-${Math.random()}@example.com`;
    const user = await createTestUser(userEmail);
    userId = user.id;
    const [project] = await db.insert(projects).values({
      userId,
      name: 'Session project',
      type: 'saas',
    }).returning();
    projectId = project.id;
  });

  it('creates, logs, and completes an owned session with native values', async () => {
    const caller = appRouter.createCaller({ userId, userEmail });
    const session = await caller.sessions.create({
      projectId,
      metadata: {
        projectType: 'saas',
        activeDomains: ['planning'],
        teamSize: 'solo',
        timeline: 'under_1_month',
        budget: 'bootstrapped',
        experienceLevel: 'beginner',
      },
    });

    await caller.sessions.logMessage({
      sessionId: session.id,
      role: 'user',
      content: 'Build a planning tool',
      domainId: 'planning',
      provider: null,
      thinkingDurationMs: null,
      streamingDurationMs: null,
      totalDurationMs: null,
      tokensUsed: null,
      errorType: null,
      metadata: null,
    });
    const updated = await caller.sessions.update({
      sessionId: session.id,
      totalMessages: 1,
      totalDomainsCompleted: 1,
      isComplete: true,
      endedAt: new Date().toISOString(),
    });
    const detail = await caller.sessions.get({ sessionId: session.id });

    expect(updated.isComplete).toBe(true);
    expect(updated.totalMessages).toBe(1);
    expect(detail.messages).toHaveLength(1);
  });

  it('rejects a project owned by another user', async () => {
    const other = await createTestUser(`sessions-other-${Date.now()}@example.com`);
    const caller = appRouter.createCaller({ userId: other.id, userEmail: other.email });
    await expect(caller.sessions.create({
      projectId,
      metadata: {
        projectType: 'saas', activeDomains: ['planning'], teamSize: 'solo',
        timeline: 'under_1_month', budget: 'bootstrapped', experienceLevel: 'beginner',
      },
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
