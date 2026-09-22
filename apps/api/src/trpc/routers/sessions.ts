import { TRPCError } from '@trpc/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DomainIdSchema } from '@devdocs/shared';
import { db, interviewMessages, interviewSessions, projects } from '../../lib/db';
import { protectedProcedure, router } from '../trpc';

const providerSchema = z.enum(['anthropic', 'openai', 'bedrock', 'metamuse']);
const metadataSchema = z.object({
  projectType: z.string(), activeDomains: z.array(DomainIdSchema), teamSize: z.string(),
  timeline: z.string(), budget: z.string(), experienceLevel: z.string(),
});

async function requireOwnedSession(sessionId: string, userId: string) {
  const session = await db.query.interviewSessions.findFirst({
    where: and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, userId)),
  });
  if (!session) throw new TRPCError({ code: 'NOT_FOUND', message: 'Session not found.' });
  return session;
}

export const sessionsRouter = router({
  create: protectedProcedure
    .input(z.object({ projectId: z.string().uuid(), metadata: metadataSchema }))
    .mutation(async ({ ctx, input }) => {
      const project = await db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId), isNull(projects.deletedAt)),
      });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
      const [session] = await db.insert(interviewSessions).values({
        projectId: input.projectId, userId: ctx.userId, metadata: input.metadata,
      }).returning();
      return session;
    }),

  logMessage: protectedProcedure.input(z.object({
    sessionId: z.string().uuid(), role: z.enum(['user', 'assistant']), content: z.string(),
    domainId: DomainIdSchema, provider: providerSchema.nullable(),
    thinkingDurationMs: z.number().int().nonnegative().nullable(),
    streamingDurationMs: z.number().int().nonnegative().nullable(),
    totalDurationMs: z.number().int().nonnegative().nullable(),
    tokensUsed: z.number().int().nonnegative().nullable(), errorType: z.string().nullable(),
    metadata: z.record(z.unknown()).nullable(),
  })).mutation(async ({ ctx, input }) => {
    await requireOwnedSession(input.sessionId, ctx.userId);
    const [message] = await db.insert(interviewMessages).values(input).returning();
    return message;
  }),

  update: protectedProcedure.input(z.object({
    sessionId: z.string().uuid(), totalMessages: z.number().int().nonnegative().optional(),
    totalDomainsCompleted: z.number().int().nonnegative().optional(),
    primaryProvider: providerSchema.optional(), isComplete: z.boolean().optional(),
    endedAt: z.string().datetime().optional(),
  })).mutation(async ({ ctx, input }) => {
    await requireOwnedSession(input.sessionId, ctx.userId);
    const { sessionId, endedAt, ...updates } = input;
    const [session] = await db.update(interviewSessions).set({
      ...updates, ...(endedAt ? { endedAt: new Date(endedAt) } : {}),
    }).where(eq(interviewSessions.id, sessionId)).returning();
    return session;
  }),

  get: protectedProcedure.input(z.object({ sessionId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const session = await requireOwnedSession(input.sessionId, ctx.userId);
    const messages = await db.query.interviewMessages.findMany({
      where: eq(interviewMessages.sessionId, input.sessionId),
    });
    return { session, messages };
  }),

  listByProject: protectedProcedure.input(z.object({ projectId: z.string().uuid() })).query(async ({ ctx, input }) => {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, input.projectId), eq(projects.userId, ctx.userId), isNull(projects.deletedAt)),
    });
    if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
    return db.query.interviewSessions.findMany({ where: eq(interviewSessions.projectId, input.projectId) });
  }),
});
