import { DOMAINS, getActiveDomains } from '@/lib/interview/domains';
import { readSavedInterviewData } from '@/lib/interview/snapshot';
import type { Project } from '@/lib/types';

interface ProjectDetails {
  interviewData?: unknown;
  documents?: readonly { domainId: string }[];
}

/** Interview state comes from the saved snapshot, never from document count. */
export function getProjectCardState(project: Project, details?: ProjectDetails) {
  const active = getActiveDomains(project.type);
  const interviewHref = `/project/${project.id}/interview`;
  const documentsHref = `/docs?project=${encodeURIComponent(project.id)}`;
  const saved = details ? readSavedInterviewData(details.interviewData) : null;
  const completed = saved
    ? active.filter(domain => saved.completedDomains.includes(domain.id)).length
    : details?.interviewData === null && project.status === 'in_progress' ? 0 : null;
  const documentCount = Array.isArray(details?.documents)
    ? active.filter(domain => details.documents!.some(document => document.domainId === domain.id)).length
    : null;
  // Legacy projects may also retain supported files outside today's domain set.
  const hasDocuments = Array.isArray(details?.documents)
    && details.documents.some(document => DOMAINS.some(domain => domain.id === document.domainId));
  const finished = saved !== null && completed === active.length;
  const started = saved !== null && (saved.conversationHistory.length > 0 || saved.completedDomains.length > 0);

  let status = project.status === 'archived' ? 'Archived' : project.status === 'complete' ? 'Marked complete' : 'In progress';
  let action = 'Open project';
  let href = interviewHref;
  if (project.status === 'archived') {
    action = hasDocuments ? 'View documents' : 'Open project';
    href = hasDocuments ? documentsHref : interviewHref;
  } else if (details) {
    if (project.status === 'complete' && hasDocuments && (finished || details.interviewData === null)) {
      status = 'Complete';
      action = 'View documents';
      href = documentsHref;
    } else if (finished) {
      status = project.status === 'complete' ? 'Planning complete' : 'Awaiting completion';
      action = 'Review planning';
    } else if (project.status === 'complete') {
      // Missing documents or an inconsistent snapshot must not imply readiness.
      status = 'Completion needs review';
      action = saved ? 'Continue planning' : 'Review project';
    } else if (started) {
      status = 'Planning in progress';
      action = 'Continue planning';
    } else if (saved || details.interviewData === null) {
      status = saved ? 'Ready to start' : 'Not started';
      action = 'Start interview';
    } else if (details.interviewData === undefined) {
      status = 'Saved workflow unavailable';
    } else {
      status = 'Setup needs review';
      action = 'Review setup';
    }
  }
  return { status, action, href, documentsHref, hasDocuments, documentCount, completed, total: active.length };
}
