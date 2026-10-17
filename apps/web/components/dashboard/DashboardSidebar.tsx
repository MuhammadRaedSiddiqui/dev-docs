"use client";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";
import s from "./dashboard.module.css";

interface Props {
  projects: Project[];
  statusFilter: "all" | "in_progress" | "complete";
  typeFilter: string | null;
  onStatusFilter: (status: "all" | "in_progress" | "complete") => void;
  onTypeFilter: (type: string) => void;
  onNewProject: () => void;
}

const TYPE_FILTERS = [
  { id: "saas", label: "SaaS products" },
  { id: "api", label: "API services" },
  { id: "internal_tool", label: "Internal tools" },
];

export function DashboardSidebar({ projects, statusFilter, typeFilter, onStatusFilter, onTypeFilter, onNewProject }: Props) {
  const counts = {
    all: projects.length,
    in_progress: projects.filter(project => project.status === "in_progress").length,
    complete: projects.filter(project => project.status === "complete").length,
  };
  return (
    <aside className="w-full md:w-[260px] max-h-[180px] md:max-h-none flex-shrink-0 border-r border-hairline bg-sidebar-mist flex flex-col py-4 overflow-y-auto">
      <div className="px-4 mb-5">
        <button type="button" onClick={onNewProject} className={s.primaryAction}>
          <span aria-hidden="true" className="text-base leading-none">+</span> New project
        </button>
      </div>
      <div className="px-2 mb-5">
        <div className="px-2 mb-2 text-[14px] font-medium text-ink-muted">Views</div>
        {([
          { status: "all" as const, label: "All projects" },
          { status: "in_progress" as const, label: "In progress", dot: true },
          { status: "complete" as const, label: "Complete", dot: true },
        ]).map(({ status, label, dot }) => (
          <button key={status} type="button" aria-pressed={statusFilter === status && !typeFilter} onClick={() => onStatusFilter(status)} className={cn("w-full min-h-[44px] flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[14px] transition-colors text-left mb-0.5", statusFilter === status && !typeFilter ? "bg-hover-veil text-ink font-medium" : "text-ink-muted hover:bg-hover-veil hover:text-ink")}>
            {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-ink" />}{label}
            <span className="ml-auto text-[14px] text-ink-muted">{counts[status]}</span>
          </button>
        ))}
      </div>
      <div className="h-px bg-hairline mx-4 mb-4" />
      <div className="px-2 mb-5">
        <div className="px-2 mb-2 text-[14px] font-medium text-ink-muted">By type</div>
        {TYPE_FILTERS.map(type => (
          <button key={type.id} type="button" aria-pressed={typeFilter === type.id} onClick={() => onTypeFilter(type.id)} className={cn("w-full min-h-[44px] flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[14px] transition-colors text-left mb-0.5", typeFilter === type.id ? "bg-hover-veil text-ink font-medium" : "text-ink-muted hover:bg-hover-veil hover:text-ink")}>
            {type.label}
          </button>
        ))}
      </div>
      <div className="mt-auto mx-4 p-4 bg-white border border-hairline rounded-lg">
        <div className="text-[14px] font-medium text-ink mb-1">BYOK workspace</div>
        <div className="text-[14px] text-ink-muted">Your provider bills AI usage directly. DevDocs does not impose a project quota.</div>
      </div>
    </aside>
  );
}
