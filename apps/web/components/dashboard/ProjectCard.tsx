"use client";
import { useId } from "react";
import Link from "next/link";
import type { Project } from "@/lib/types";
import { PROJECT_TYPE_LABELS } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { useInterviewStore } from "@/lib/interview/store";
import { getProjectCardState } from "./project-card-state";
import { ProjectActionsMenu } from "./ProjectActionsMenu";
import s from "./dashboard.module.css";

interface Props {
  project: Project;
  onDelete: (project: Project, trigger: HTMLButtonElement) => void;
  onDownload: (project: Project) => void;
  onRename: (project: Project, trigger: HTMLButtonElement) => void;
  downloadState?: "preparing" | "error";
}

export function ProjectCard({ project, onDelete, onDownload, onRename, downloadState }: Props) {
  const titleId = useId();
  const details = trpc.projects.get.useQuery({ id: project.id });
  const state = getProjectCardState(project, details.data);
  const loading = details.isLoading;
  const hasDrafts = useInterviewStore(store => Object.keys(store.documentDrafts).length > 0);

  return (
    <article className={s.card} aria-labelledby={titleId}>
      <div className={s.cardHeader}>
        <div className={s.cardName}>
          <p className={s.projectType}>{PROJECT_TYPE_LABELS[project.type]}</p>
          <h2 id={titleId}><Link href={state.href} className={s.title}>{project.name}</Link></h2>
        </div>
        <ProjectActionsMenu projectName={project.name} canDownload={state.hasDocuments && !hasDrafts} preparingDownload={downloadState === "preparing"} onRename={trigger => onRename(project, trigger)} onDownload={() => onDownload(project)} onDelete={trigger => onDelete(project, trigger)} />
      </div>
      <p className={s.status}>{state.status}</p>
      <dl className={s.metadata}>
        <div>
          <dt>Documentation</dt>
          <dd>{loading ? "Loading saved documents…" : state.documentCount === null ? "Saved-document count unavailable" : `${state.documentCount} of ${state.total} domains saved`}</dd>
        </div>
        <div>
          <dt>Interview</dt>
          <dd>{loading ? "Loading saved progress…" : state.completed === null ? "Saved interview progress unavailable" : `${state.completed} of ${state.total} domains completed`}</dd>
        </div>
      </dl>
      <p className={s.projectType}>{project.updatedAt && project.updatedAt !== "Unknown" ? `Updated ${project.updatedAt}` : "Update date unavailable"}</p>
      {details.error && <div role="status" className="text-[14px] text-ink-muted">
        Project details could not be loaded.
        <button type="button" className={s.retry} onClick={() => void details.refetch()}>Retry project details</button>
      </div>}
      <div className={s.actions}>
        {hasDrafts && state.hasDocuments && <p className={s.downloadStatus}>Save or discard document edits before downloading.</p>}
        {downloadState === "preparing" && <p role="status" className={s.downloadStatus}>Preparing documentation…</p>}
        {downloadState === "error" && <div role="alert" className={s.downloadStatus}>Could not download saved documentation.<button type="button" className={s.retry} onClick={() => onDownload(project)}>Retry download</button></div>}
        {loading ? <button type="button" disabled className={s.primaryAction}>Loading project…</button> : <Link href={state.href} className={s.primaryAction}>{state.action}</Link>}
        <div className={s.secondaryRow}>
          {state.hasDocuments ? <Link href={state.documentsHref} className={s.textLink}>View saved documents</Link> : <p>{loading ? "Loading saved documents…" : state.documentCount === null ? "Saved documents unavailable" : "No saved documents yet."}</p>}
        </div>
      </div>
    </article>
  );
}
