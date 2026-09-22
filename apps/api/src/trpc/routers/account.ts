import { TRPCError } from '@trpc/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  documentationBundles,
  interviewMessages,
  interviewSessions,
  projects,
  userApiKeys,
  users,
} from '../../lib/db';
import { logger } from '../../lib/logger';
import { protectedProcedure, router } from '../trpc';

export const accountRouter = router({
  /**
   * Return a portable copy of every user-owned record. API-key ciphertext and
   * hashes are intentionally excluded; only non-secret connection metadata is
   * part of the export.
   */
  exportData: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [account, ownedProjects, documents, sessions, messages, apiKeyConnections] =
        await Promise.all([
          db.query.users.findFirst({
            where: eq(users.id, ctx.userId),
            columns: {
              id: true,
              email: true,
              displayName: true,
              avatarUrl: true,
              createdAt: true,
              updatedAt: true,
            },
          }),
          db.query.projects.findMany({
            where: eq(projects.userId, ctx.userId),
            orderBy: [asc(projects.createdAt)],
          }),
          db
            .select({
              id: documentationBundles.id,
              projectId: documentationBundles.projectId,
              domainId: documentationBundles.domainId,
              content: documentationBundles.content,
              createdAt: documentationBundles.createdAt,
              updatedAt: documentationBundles.updatedAt,
            })
            .from(documentationBundles)
            .innerJoin(projects, eq(documentationBundles.projectId, projects.id))
            .where(eq(projects.userId, ctx.userId))
            .orderBy(asc(documentationBundles.createdAt)),
          db.query.interviewSessions.findMany({
            where: eq(interviewSessions.userId, ctx.userId),
            orderBy: [asc(interviewSessions.startedAt)],
          }),
          db
            .select({
              id: interviewMessages.id,
              sessionId: interviewMessages.sessionId,
              role: interviewMessages.role,
              content: interviewMessages.content,
              domainId: interviewMessages.domainId,
              provider: interviewMessages.provider,
              timestamp: interviewMessages.timestamp,
              thinkingDurationMs: interviewMessages.thinkingDurationMs,
              streamingDurationMs: interviewMessages.streamingDurationMs,
              totalDurationMs: interviewMessages.totalDurationMs,
              tokensUsed: interviewMessages.tokensUsed,
              errorType: interviewMessages.errorType,
              metadata: interviewMessages.metadata,
            })
            .from(interviewMessages)
            .innerJoin(interviewSessions, eq(interviewMessages.sessionId, interviewSessions.id))
            .where(eq(interviewSessions.userId, ctx.userId))
            .orderBy(asc(interviewMessages.timestamp)),
          db
            .select({
              provider: userApiKeys.provider,
              maskedKey: userApiKeys.maskedKey,
              createdAt: userApiKeys.createdAt,
              updatedAt: userApiKeys.updatedAt,
            })
            .from(userApiKeys)
            .where(eq(userApiKeys.userId, ctx.userId))
            .orderBy(asc(userApiKeys.createdAt)),
        ]);

      if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found.' });
      }

      logger.info({ userId: ctx.userId }, 'Exported account data');
      return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        account,
        projects: ownedProjects,
        documents,
        interviewSessions: sessions,
        interviewMessages: messages,
        apiKeyConnections,
      };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      logger.error({ err, userId: ctx.userId }, 'Failed to export account data');
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to prepare your data export.',
      });
    }
  }),

  /** Delete the local user row; foreign-key cascades remove all owned data. */
  deleteData: protectedProcedure
    .input(z.object({ confirmation: z.literal('DELETE') }))
    .mutation(async ({ ctx }) => {
      try {
        const deleted = await db
          .delete(users)
          .where(eq(users.id, ctx.userId))
          .returning({ id: users.id });

        if (deleted.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found.' });
        }

        logger.info({ userId: ctx.userId }, 'Deleted local account data');
        return { success: true } as const;
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        logger.error({ err, userId: ctx.userId }, 'Failed to delete local account data');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete your data.',
        });
      }
    }),
});
