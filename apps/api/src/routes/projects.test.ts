import { beforeEach, describe, expect, it } from 'vitest';
import { appRouter } from '../trpc/router';
import { createTestUser } from '../test/helpers';
import { db, projects } from '../lib/db';
import { eq } from 'drizzle-orm';

describe('projects tRPC ownership, validation and lifecycle', () => {
  let owner: ReturnType<typeof appRouter.createCaller>;
  let other: ReturnType<typeof appRouter.createCaller>;
  beforeEach(async () => {
    const a = await createTestUser(`owner-${crypto.randomUUID()}@example.test`);
    const b = await createTestUser(`other-${crypto.randomUUID()}@example.test`);
    owner = appRouter.createCaller({ userId: a.id, userEmail: a.email });
    other = appRouter.createCaller({ userId: b.id, userEmail: b.email });
  });
  it.each(['saas', 'api', 'internal_tool', 'mobile', 'landing_page', 'other'] as const)('creates and retrieves %s projects', async type => {
    const created = await owner.projects.create({ name: 'New project', type });
    expect(created.status).toBe('in_progress');
    expect((await owner.projects.get({ id: created.id })).name).toBe('New project');
    expect(await other.projects.list()).toEqual([]);
  });
  it('renames projects and persists interview snapshots', async () => {
    const created = await owner.projects.create({ name: 'Original', type: 'saas' });
    await owner.projects.update({ id: created.id, data: { name: 'Renamed', interviewData: { completedDomains: ['planning'] } } });
    const result = await owner.projects.get({ id: created.id });
    expect(result.name).toBe('Renamed'); expect(result.domainsCompleted).toBe(1);
  });
  it('denies get, update, delete and document access across owners', async () => {
    const p = await owner.projects.create({ name: 'Private', type: 'saas' });
    await expect(other.projects.get({ id: p.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(other.projects.update({ id: p.id, data: { name: 'Stolen' } })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(other.projects.delete({ id: p.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(other.documents.listByProject({ projectId: p.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('soft deletes and denies subsequent reads and writes', async () => {
    const p = await owner.projects.create({ name: 'Delete me', type: 'saas' });
    await owner.projects.delete({ id: p.id });
    expect(await owner.projects.list()).toEqual([]);
    const [row] = await db.select().from(projects).where(eq(projects.id, p.id));
    expect(row.deletedAt).not.toBeNull();
    await expect(owner.projects.get({ id: p.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(owner.projects.update({ id: p.id, data: { name: 'Resurrected' } })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(owner.documents.update({ projectId: p.id, domainId: 'planning', content: 'deleted' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('rejects invalid UUIDs, empty mutations and oversized names', async () => {
    await expect(owner.projects.get({ id: 'invalid' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(owner.projects.create({ name: '', type: 'saas' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(owner.projects.create({ name: 'x'.repeat(101), type: 'saas' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(owner.projects.update({ id: crypto.randomUUID(), data: {} })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('requires authentication', async () => {
    const anonymous = appRouter.createCaller({ userId: null, userEmail: null });
    await expect(anonymous.projects.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(anonymous.projects.create({ name: 'No auth', type: 'saas' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
