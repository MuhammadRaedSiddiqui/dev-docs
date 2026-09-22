"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { CreateProjectModal } from "@/components/dashboard/CreateProjectModal";
import { buildProjectZip } from "@/lib/export/buildZip";
import type { Project, ProjectContext, ProjectType, DomainId } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { useUser } from "@clerk/nextjs";

export default function DashboardPage() {
  const { user } = useUser();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"all"|"in_progress"|"complete">("all");
  const [typeFilter, setTypeFilter] = useState<string|null>(null);
  const [sort, setSort] = useState<"recent"|"name"|"progress">("recent");
  const [modalOpen, setModalOpen] = useState(false);
  const projectsQuery = trpc.projects.list.useQuery();
  const utils = trpc.useUtils();
  const [navigating, setNavigating] = useState(false);
  const createProject = trpc.projects.create.useMutation({
    onSuccess: (project) => {
      utils.projects.list.invalidate();
      setNavigating(true);
      router.push(`/project/${project.id}/interview`);
    },
  });
  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const projects = (projectsQuery.data ?? []) as Project[];

  let list = [...projects];
  if (statusFilter !== "all") list = list.filter(p => p.status === statusFilter);
  if (typeFilter) list = list.filter(p => p.type === typeFilter);
  if (sort === "name") list.sort((a,b) => a.name.localeCompare(b.name));
  if (sort === "progress") list.sort((a,b) => b.domainsCompleted - a.domainsCompleted);

  function handleTypeFilter(t: string) { setTypeFilter(c => c === t ? null : t); setStatusFilter("all"); }
  function handleDelete(id: string) { deleteProject.mutate({ id }); }
  async function handleDownload(p: Project) {
    try {
      const full = await utils.projects.get.fetch({ id: p.id });
      const data = full.interviewData as { lockedContext?: ProjectContext; domainContent?: Partial<Record<DomainId, string>> } | null;
      const canonicalContent = Object.fromEntries(
        (full.documents ?? []).map(document => [document.domainId, document.content]),
      ) as Partial<Record<DomainId, string>>;
      const domainContent = Object.keys(canonicalContent).length > 0
        ? canonicalContent
        : data?.domainContent;
      if (data?.lockedContext && domainContent) {
        const blob = await buildProjectZip(data.lockedContext, domainContent);
        const slug = p.name.replace(/\s+/g, "-").toLowerCase();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${slug}-docs.zip`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([`# ${p.name}\n\n${p.description}`], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${p.name.replace(/\s+/g, "-").toLowerCase()}.md`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      }
    } catch {
      const blob = new Blob([`# ${p.name}\n\n${p.description}`], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${p.name.replace(/\s+/g, "-").toLowerCase()}.md`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  }
  function handleCreate(name: string, type: ProjectType) {
    createProject.mutate({ name, type });
  }

  const label = typeFilter ? typeFilter : statusFilter === "all" ? "All projects" : statusFilter === "in_progress" ? "In progress" : "Complete";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar active="projects" />
      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar projects={projects} statusFilter={statusFilter} typeFilter={typeFilter} onStatusFilter={s=>{setStatusFilter(s);setTypeFilter(null);}} onTypeFilter={handleTypeFilter} onNewProject={()=>setModalOpen(true)} />
        <main className="flex-1 overflow-y-auto px-8 py-7">
          <StatStrip projects={projects} userName={user?.firstName ?? user?.username ?? undefined} />
          {projectsQuery.error && <div className="mb-4 text-sm text-danger">Unable to load projects. Please refresh and try again.</div>}
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">{label} — {list.length}</div>
            <div className="flex gap-1.5">
              {(["recent","name","progress"] as const).map(s => (
                <button key={s} type="button" onClick={()=>setSort(s)} className={`px-2.5 py-1 text-xs rounded-lg border capitalize transition-colors ${sort===s?"bg-ink text-white border-ink":"bg-white text-ink-muted border-vellum-border hover:text-ink hover:border-ink"}`}>{s}</button>
              ))}
            </div>
          </div>
          {projectsQuery.isLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="bg-vellum-border-light animate-pulse rounded-vellum min-h-[152px]" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="py-16 text-center text-ink-faint">
              <div className="text-3xl mb-3">○</div>
              <div className="font-serif-heading text-base text-ink mb-1.5">Nothing here yet</div>
              <div className="text-[13px]">Create a project to get started.</div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
              {list.map(p => <ProjectCard key={p.id} project={p} onDelete={handleDelete} onDownload={handleDownload} />)}
              <button type="button" onClick={()=>setModalOpen(true)} className="bg-vellum border border-dashed border-ink/20 rounded-vellum flex items-center justify-center min-h-[152px] text-ink-faint hover:border-ink hover:bg-vellum-border-light transition-colors">
                <div className="text-center"><div className="text-xl mb-1">+</div><div className="text-[13px] font-medium text-ink-muted">New project</div><div className="text-[11px] mt-0.5">Start the interview</div></div>
              </button>
            </div>
          )}
        </main>
      </div>
      <CreateProjectModal open={modalOpen} onClose={()=>setModalOpen(false)} onCreate={handleCreate} creating={createProject.isPending || navigating} />
    </div>
  );
}
