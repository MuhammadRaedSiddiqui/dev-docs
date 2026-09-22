import { asc, eq } from 'drizzle-orm';
import { DomainIdSchema } from '@devdocs/shared';
import { db, documentationBundles } from './db';

export interface LegacyInterviewData {
  domainContent?: Record<string, unknown>;
}

/**
 * Return canonical documents for a project, backfilling document bundles from
 * legacy `projects.interview_data.domainContent` when necessary.
 */
export async function getProjectDocuments(projectId: string, interviewData: unknown) {
  let rows = await db
    .select()
    .from(documentationBundles)
    .where(eq(documentationBundles.projectId, projectId))
    .orderBy(asc(documentationBundles.createdAt));

  const legacy = interviewData && typeof interviewData === 'object' && !Array.isArray(interviewData)
    ? interviewData as LegacyInterviewData
    : null;
  const domainContent = legacy?.domainContent;
  if (!domainContent || typeof domainContent !== 'object' || Array.isArray(domainContent)) return rows;

  const existingDomains = new Set(rows.map(row => row.domainId));
  const values = Object.entries(domainContent).flatMap(([domainId, content]) => {
    const parsedDomain = DomainIdSchema.safeParse(domainId);
    return parsedDomain.success
      && !existingDomains.has(parsedDomain.data)
      && typeof content === 'string'
      && content.trim()
      ? [{ projectId, domainId: parsedDomain.data, content }]
      : [];
  });

  if (values.length === 0) return rows;

  await db
    .insert(documentationBundles)
    .values(values)
    .onConflictDoNothing({
      target: [documentationBundles.projectId, documentationBundles.domainId],
    });

  rows = await db
    .select()
    .from(documentationBundles)
    .where(eq(documentationBundles.projectId, projectId))
    .orderBy(asc(documentationBundles.createdAt));

  return rows;
}
