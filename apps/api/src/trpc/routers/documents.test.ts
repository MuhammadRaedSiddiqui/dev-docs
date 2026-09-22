import { beforeEach, describe, expect, it } from 'vitest';
import { db, projects } from '../../lib/db';
import { createTestUser } from '../../test/helpers';
import { appRouter } from '../router';

describe('documents router', () => {
  let userId: string;
  let projectId: string;

  beforeEach(async () => {
    const user = await createTestUser(`documents-${Date.now()}-${Math.random()}@example.com`);
    userId = user.id;
    const [project] = await db.insert(projects).values({
      userId,
      name: 'Legacy Documents',
      type: 'saas',
      interviewData: {
        domainContent: {
          planning: '## Planning\n\n**MVP:** Legacy content',
          architecture: '## Architecture\n\n**Pattern:** Monolith',
          invalid_domain: 'must not migrate',
        },
      },
    }).returning();
    projectId = project.id;
  });

  it('backfills legacy snapshot documents and persists edits canonically', async () => {
    const caller = appRouter.createCaller({ userId, userEmail: 'documents@example.com' });
    const migrated = await caller.documents.listByProject({ projectId });

    expect(migrated).toHaveLength(2);
    expect(migrated.map(document => document.domainId).sort()).toEqual(['architecture', 'planning']);

    await caller.documents.update({
      projectId,
      domainId: 'planning',
      content: '## Planning\n\n**MVP:** Canonical edit',
    });

    const updated = await caller.documents.listByProject({ projectId });
    expect(updated.find(document => document.domainId === 'planning')?.content)
      .toContain('Canonical edit');
  });

  it('does not allow another user to update a project document', async () => {
    const other = await createTestUser(`documents-other-${Date.now()}@example.com`);
    const caller = appRouter.createCaller({ userId: other.id, userEmail: other.email });

    await expect(caller.documents.update({
      projectId,
      domainId: 'planning',
      content: 'unauthorized',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
