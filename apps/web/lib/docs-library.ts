import { DOMAINS } from "@/lib/interview/domains";
import {
  PROJECT_TYPE_BADGE_CLASS,
  type DomainId,
  type ProjectType,
} from "@/lib/types";

export interface LibraryDoc {
  id: string;
  projectId: string;
  project: string;
  projectBadgeClass: string;
  domainId: DomainId;
  domainLabel: string;
  file: string;
  date: string;
  content: string;
  snippet: string;
  order: number;
}

export interface LibraryDocumentRecord {
  id: string;
  projectId: string;
  projectName: string;
  projectType: string;
  domainId: string;
  content: string;
  updatedAt: Date | string | null;
}

function isProjectType(value: string): value is ProjectType {
  return value in PROJECT_TYPE_BADGE_CLASS;
}

function timeAgo(value: Date | string | null): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function buildLibraryDocs(records: readonly LibraryDocumentRecord[]): LibraryDoc[] {
  return records.flatMap(record => {
    const domain = DOMAINS.find(candidate => candidate.id === record.domainId);
    if (!domain) return [];

    const projectType = isProjectType(record.projectType) ? record.projectType : "other";
    const snippetLine = record.content.split("\n").find(line => line.startsWith("**"))
      ?? record.content.split("\n").find(Boolean)
      ?? "";
    const timestamp = record.updatedAt ? new Date(record.updatedAt).getTime() : 0;

    return [{
      id: record.id,
      projectId: record.projectId,
      project: record.projectName,
      projectBadgeClass: PROJECT_TYPE_BADGE_CLASS[projectType],
      domainId: domain.id,
      domainLabel: domain.label,
      file: domain.file,
      date: timeAgo(record.updatedAt),
      content: record.content,
      snippet: snippetLine.replace(/\*\*/g, "").trim(),
      order: -timestamp,
    }];
  });
}
