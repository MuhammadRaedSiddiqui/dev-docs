import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DomainIdSchema } from '@devdocs/shared';
import { db, documentationBundles, projects } from '../../lib/db';
import { getProjectDocuments } from '../../lib/documents';
import { invalidateDocSection } from '../../lib/redis';
import { protectedProcedure, router } from '../trpc';

async function requireOwnedProject(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.userId, userId),
      isNull(projects.deletedAt),
    ),
  });

  if (!project) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found.' });
  }
  return project;
}

export const documentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const ownedProjects = await db.query.projects.findMany({
      where: and(eq(projects.userId, ctx.userId), isNull(projects.deletedAt)),
    });

    // Transparently migrate document bodies written by older web clients.
    await Promise.all(
      ownedProjects.map(project => getProjectDocuments(project.id, project.interviewData)),
    );

    return db
      .select({
        id: documentationBundles.id,
        projectId: documentationBundles.projectId,
        projectName: projects.name,
        projectType: projects.type,
        domainId: documentationBundles.domainId,
        content: documentationBundles.content,
        createdAt: documentationBundles.createdAt,
        updatedAt: documentationBundles.updatedAt,
      })
      .from(documentationBundles)
      .innerJoin(projects, eq(documentationBundles.projectId, projects.id))
      .where(and(eq(projects.userId, ctx.userId), isNull(projects.deletedAt)))
      .orderBy(desc(documentationBundles.updatedAt));
  }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const project = await requireOwnedProject(input.projectId, ctx.userId);
      return getProjectDocuments(project.id, project.interviewData);
    }),

  update: protectedProcedure
    .input(z.object({
      projectId: z.string().uuid(),
      domainId: DomainIdSchema,
      content: z.string().max(100_000),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireOwnedProject(input.projectId, ctx.userId);

      const [document] = await db
        .insert(documentationBundles)
        .values(input)
        .onConflictDoUpdate({
          target: [documentationBundles.projectId, documentationBundles.domainId],
          set: { content: input.content, updatedAt: new Date() },
        })
        .returning();

      await invalidateDocSection(input.projectId, input.domainId).catch(() => undefined);
      return document;
    }),
});
