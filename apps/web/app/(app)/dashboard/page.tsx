"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { CreateProjectModal } from "@/components/dashboard/CreateProjectModal";
import { RenameProjectDialog } from "@/components/dashboard/RenameProjectDialog";
import { DeleteProjectDialog } from "@/components/dashboard/DeleteProjectDialog";
import { buildSavedDocumentationZip } from "@/lib/export/buildZip";
import type { Project, ProjectType } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/nextjs";
import { useToast } from "@/lib/toast";
import { useInterviewStore } from "@/lib/interview/store";
import s from "@/components/dashboard/dashboard.module.css";

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all"|"in_progress"|"complete">("all");
  const [typeFilter, setTypeFilter] = useState<string|null>(null);
  const [sort, setSort] = useState<"recent"|"name"|"progress">("recent");
  const [modalOpen, setModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ project: Project; trigger: HTMLButtonElement } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ project: Project; trigger: HTMLButtonElement } | null>(null);
  const downloadRequests = useRef(new Set<string>());
  const [downloads, setDownloads] = useState<Record<string, "preparing" | "error">>({});
  const projectsQuery = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();
  const [navigating, setNavigating] = useState(false);
  const createProject = trpc.projects.create.useMutation({
    onError: error => toast(error.message, 'error'),
    onSuccess: (project) => {
      utils.projects.list.invalidate();
      setNavigating(true);
      router.push(`/project/${project.id}/interview`);
    },
  });
  function handleRename(project: Project, trigger: HTMLButtonElement) {
    setRenameTarget({ project, trigger });
  }
  const projects = (projectsQuery.data ?? []) as Project[];

  let list = [...projects];
  if (statusFilter !== "all") list = list.filter(p => p.status === statusFilter);
  if (typeFilter) list = list.filter(p => p.type === typeFilter);
  if (sort === "name") list.sort((a,b) => a.name.localeCompare(b.name));
  if (sort === "progress") list.sort((a,b) => b.domainsCompleted - a.domainsCompleted);

  function handleTypeFilter(t: string) { setTypeFilter(c => c === t ? null : t); setStatusFilter("all"); }
  function handleDelete(project: Project, trigger: HTMLButtonElement) { setDeleteTarget({ project, trigger }); }
  async function handleDownload(p: Project) {
    if (Object.keys(useInterviewStore.getState().documentDrafts).length > 0) {
      toast('Save or discard document edits before downloading.', 'info');
      return;
    }
    if (downloadRequests.current.has(p.id)) return;
    downloadRequests.current.add(p.id);
    setDownloads(previous => ({ ...previous, [p.id]: "preparing" }));
    try {
      const full = await utils.projects.get.fetch({ id: p.id }, { staleTime: 0, retry: false });
      // projects.get reconciles legacy records server-side; canonical saved
      // documents win. Never export snapshot bodies or generate new content.
      const blob = await buildSavedDocumentationZip(full.documents ?? []);
      const slug = full.name.replace(/\s+/g, "-").toLowerCase();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${slug}-docs.zip`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setDownloads(previous => { const next = { ...previous }; delete next[p.id]; return next; });
    } catch {
      setDownloads(previous => ({ ...previous, [p.id]: "error" }));
    } finally {
      downloadRequests.current.delete(p.id);
    }
  }
  function handleCreate(name: string, type: ProjectType) {
    return createProject.mutateAsync({ name, type });
  }

  const label = typeFilter ? typeFilter : statusFilter === "all" ? "All projects" : statusFilter === "in_progress" ? "In progress" : "Complete";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar active="projects" />
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        <DashboardSidebar projects={projects} statusFilter={statusFilter} typeFilter={typeFilter} onStatusFilter={s=>{setStatusFilter(s);setTypeFilter(null);}} onTypeFilter={handleTypeFilter} onNewProject={()=>setModalOpen(true)} />
        <main className="flex-1 min-w-0 overflow-y-auto px-4 md:px-8 py-7">
          <StatStrip projects={projects} userName={user?.firstName ?? user?.username ?? undefined} />
          {projectsQuery.error && <div className="mb-4 text-sm text-danger">Unable to load projects. Please refresh and try again.</div>}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="text-[14px] font-medium text-ink-muted">{label} — {list.length}</div>
            <div className={s.sortGroup} role="group" aria-label="Sort projects">
              {(["recent","name","progress"] as const).map(option => (
                <button key={option} type="button" aria-pressed={sort === option} title={option === "progress" ? "Sort by completed interview domains" : undefined} onClick={()=>setSort(option)} className={s.sortOption}>{option}</button>
              ))}
            </div>
          </div>
          {projectsQuery.isLoading ? (
            <div className={s.projectGrid}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="bg-vellum-border-light animate-pulse rounded-vellum min-h-[152px]" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-ink-muted">
              <div className="text-3xl mb-3">○</div>
              <div className="font-serif-heading text-base text-ink mb-1.5">Nothing here yet</div>
              <div className="text-[14px]">Create a project to get started.</div>
            </div>
          ) : (
            <div className={s.projectGrid}>
              {list.map(p => <ProjectCard key={p.id} project={p} onRename={handleRename} onDelete={handleDelete} onDownload={handleDownload} downloadState={downloads[p.id]} />)}
              <button type="button" onClick={()=>setModalOpen(true)} className="bg-vellum border border-dashed border-ink-muted rounded-vellum flex items-center justify-center min-h-[152px] text-ink-muted hover:border-ink hover:bg-vellum-border-light transition-colors">
                <div className="text-center"><div aria-hidden="true" className="text-xl mb-1">+</div><div className="text-[14px] font-medium">New project</div><div className="text-[14px] mt-1">Start the interview</div></div>
              </button>
            </div>
          )}
        </main>
      </div>
      <CreateProjectModal open={modalOpen} onClose={()=>setModalOpen(false)} onCreate={handleCreate} creating={createProject.isPending || navigating} />
      {renameTarget && <RenameProjectDialog key={renameTarget.project.id} project={renameTarget.project} returnFocus={renameTarget.trigger} onClose={() => setRenameTarget(null)} />}
      {deleteTarget && <DeleteProjectDialog key={deleteTarget.project.id} project={deleteTarget.project} returnFocus={deleteTarget.trigger} onClose={() => setDeleteTarget(null)} />}
    </div>
  );
}
