// apps/api/src/trpc/routers/projects.ts
// tRPC projects router - fully type-safe API with autocomplete

import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db, projects } from '../../lib/db';
import { ProjectCreateSchema, ProjectUpdateSchema } from '@devdocs/shared';
import { logger } from '../../lib/logger';
import { getProjectDocuments } from '../../lib/documents';

export const projectsRouter = router({
  /**
   * List all projects for authenticated user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const { userId } = ctx;

    try {
      const rows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.userId, userId), isNull(projects.deletedAt)))
        .orderBy(desc(projects.updatedAt));

      const result = rows.map(p => ({
        id:               p.id,
        name:             p.name,
        type:             p.type,
        status:           p.status,
        description:      p.description ?? '',
        domainsCompleted: countDomains(p.interviewData),
        updatedAt:        timeAgo(p.updatedAt),
      }));

      logger.info({ userId, count: result.length }, 'Listed projects (tRPC)');
      return result;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to list projects (tRPC)');
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to load projects.',
      });
    }
  }),

  /**
   * Get a single project by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { userId } = ctx;
      const { id } = input;

      try {
        const row = await db.query.projects.findFirst({
          where: and(
            eq(projects.id, id),
            eq(projects.userId, userId),
            isNull(projects.deletedAt)
          ),
        });

        if (!row) {
          logger.warn({ projectId: id, userId }, 'Project not found (tRPC)');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found.',
          });
        }

        const documents = await getProjectDocuments(row.id, row.interviewData);

        logger.info({ projectId: row.id, userId }, 'Retrieved project (tRPC)');
        return {
          id:               row.id,
          name:             row.name,
          type:             row.type,
          status:           row.status,
          description:      row.description ?? '',
          domainsCompleted: countDomains(row.interviewData),
          interviewData:    row.interviewData,
          documents,
          updatedAt:        timeAgo(row.updatedAt),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        logger.error({ err, projectId: id, userId }, 'Failed to load project (tRPC)');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to load project.',
        });
      }
    }),

  /**
   * Create a new project
   */
  create: protectedProcedure
    .input(ProjectCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;
      const { name, type } = input;

      try {
        const [row] = await db
          .insert(projects)
          .values({
            userId,
            name,
            type,
            status: 'in_progress',
          })
          .returning();

        logger.info({ userId, projectId: row.id, name, type }, 'Project created (tRPC)');
        return {
          id:               row.id,
          name:             row.name,
          type:             row.type,
          status:           row.status,
          description:      '',
          domainsCompleted: 0,
          updatedAt:        'Just now',
        };
      } catch (err) {
        logger.error({ err, userId, name }, 'Failed to create project (tRPC)');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create project.',
        });
      }
    }),

  /**
   * Update a project
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: ProjectUpdateSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;
      const { id, data } = input;

      try {
        // Verify ownership
        const existing = await db.query.projects.findFirst({
          where: and(
            eq(projects.id, id),
            eq(projects.userId, userId),
            isNull(projects.deletedAt)
          ),
        });

        if (!existing) {
          logger.warn({ projectId: id, userId }, 'Project not found for update (tRPC)');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found.',
          });
        }

        const [row] = await db
          .update(projects)
          .set({
            ...(data.name          && { name:          data.name }),
            ...(data.status        && { status:        data.status }),
            ...(data.interviewData && { interviewData: data.interviewData }),
            updatedAt: new Date(),
          })
          .where(eq(projects.id, id))
          .returning();

        logger.info({ userId, projectId: id }, 'Project updated (tRPC)');
        return {
          id:               row.id,
          name:             row.name,
          type:             row.type,
          status:           row.status,
          description:      row.description ?? '',
          domainsCompleted: countDomains(row.interviewData),
          updatedAt:        'Just now',
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        logger.error({ err, projectId: id, userId }, 'Failed to update project (tRPC)');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update project.',
        });
      }
    }),

  /**
   * Delete a project (soft delete)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = ctx;
      const { id } = input;

      try {
        const existing = await db.query.projects.findFirst({
          where: and(eq(projects.id, id), eq(projects.userId, userId)),
        });

        if (!existing) {
          logger.warn({ projectId: id, userId }, 'Project not found for deletion (tRPC)');
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found.',
          });
        }

        await db
          .update(projects)
          .set({ deletedAt: new Date() })
          .where(eq(projects.id, id));

        logger.info({ userId, projectId: id }, 'Project deleted (tRPC)');
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        logger.error({ err, projectId: id, userId }, 'Failed to delete project (tRPC)');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete project.',
        });
      }
    }),
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function countDomains(interviewData: unknown): number {
  if (!interviewData || typeof interviewData !== 'object') return 0;
  const data = interviewData as Record<string, unknown>;
  if (!Array.isArray(data.completedDomains)) return 0;
  return (data.completedDomains as unknown[]).length;
}

function timeAgo(date: Date | null | undefined): string {
  if (!date) return 'Unknown';
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
