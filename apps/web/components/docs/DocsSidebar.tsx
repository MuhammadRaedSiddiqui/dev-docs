"use client";

import { cn } from "@/lib/utils";
import { DOMAINS } from "@/lib/interview/domains";
import type { LibraryDoc } from "@/lib/docs-library";
import type { DomainId } from "@/lib/types";

interface Props {
  docs: LibraryDoc[];
  domainFilter: DomainId | null;
  projectFilter: string | null;
  onDomainFilter: (id: DomainId) => void;
  onProjectFilter: (name: string) => void;
  onReset: () => void;
}

function Item({ active, onClick, label, count }: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[14px] transition-colors text-left",
        active ? "bg-hover-veil text-ink font-medium" : "text-ink-muted hover:bg-hover-veil hover:text-ink",
      )}
    >
      {label}<span className="ml-auto text-[11px] text-ink-faint">{count}</span>
    </button>
  );
}

export function DocsSidebar({
  docs,
  domainFilter,
  projectFilter,
  onDomainFilter,
  onProjectFilter,
  onReset,
}: Props) {
  const domainCounts: Partial<Record<DomainId, number>> = {};
  docs.forEach(document => {
    domainCounts[document.domainId] = (domainCounts[document.domainId] ?? 0) + 1;
  });
  const projects = Array.from(
    new Map(docs.map(document => [document.projectId, document.project])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <aside className="hidden md:flex w-[260px] flex-shrink-0 border-r border-hairline bg-sidebar-mist flex-col py-4 overflow-y-auto">
      <div className="px-2 mb-[18px]">
        <Item active={!domainFilter && !projectFilter} onClick={onReset} label="All documents" count={docs.length} />
      </div>
      <div className="px-2 mb-[18px]">
        <div className="px-2.5 mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-faint">By domain</div>
        {DOMAINS.map(domain => {
          const count = domainCounts[domain.id] ?? 0;
          if (!count) return null;
          return (
            <Item
              key={domain.id}
              active={domainFilter === domain.id}
              onClick={() => onDomainFilter(domain.id)}
              label={domain.label}
              count={count}
            />
          );
        })}
      </div>
      <div className="h-px bg-vellum-border-light mx-4 mb-4" />
      <div className="px-2">
        <div className="px-2.5 mb-2 text-[10px] font-medium uppercase tracking-wider text-ink-faint">By project</div>
        {projects.map(([projectId, projectName]) => (
          <Item
            key={projectId}
            active={projectFilter === projectId}
            onClick={() => onProjectFilter(projectId)}
            label={projectName}
            count={docs.filter(document => document.projectId === projectId).length}
          />
        ))}
      </div>
    </aside>
  );
}
