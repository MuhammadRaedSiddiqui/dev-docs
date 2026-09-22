"use client";
import { useMemo, useState } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { DocList, DocPreview } from "@/components/docs/DocList";
import { buildLibraryDocs } from "@/lib/docs-library";
import type { DomainId } from "@/lib/types";
import { trpc } from "@/lib/trpc";

export default function DocsPage() {
  const [domainFilter, setDomainFilter] = useState<DomainId|null>(null);
  const [projectFilter, setProjectFilter] = useState<string|null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent"|"project"|"domain">("recent");
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const documentsQuery = trpc.documents.list.useQuery();
  const docs = useMemo(
    () => buildLibraryDocs(documentsQuery.data ?? []),
    [documentsQuery.data],
  );

  let filtered = [...docs];
  if (domainFilter) filtered = filtered.filter(d => d.domainId === domainFilter);
  if (projectFilter) filtered = filtered.filter(d => d.projectId === projectFilter);

  const selectedDoc = docs.find(d => d.id === selectedId) ?? null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar active="docs"/>
      <div className="flex flex-1 overflow-hidden">
        <DocsSidebar
          docs={docs}
          domainFilter={domainFilter}
          projectFilter={projectFilter}
          onDomainFilter={id=>{ setDomainFilter(id); setProjectFilter(null); }}
          onProjectFilter={name=>{ setProjectFilter(name); setDomainFilter(null); }}
          onReset={()=>{ setDomainFilter(null); setProjectFilter(null); }}
        />
        <main className="flex-1 flex flex-col overflow-hidden px-7 py-6">
          <div className="mb-4 flex-shrink-0">
            <div className="font-serif-heading text-2xl text-ink mb-1">Documentation library</div>
            <div className="text-[13px] text-ink-muted">Everything DevDocs AI has generated, across every project.</div>
          </div>
          <div className="flex-1 flex overflow-hidden min-h-0 border border-vellum-border rounded-vellum bg-white">
            {documentsQuery.isLoading ? (
              <div className="flex-1 grid place-items-center text-sm text-ink-faint">Loading documentation…</div>
            ) : documentsQuery.error ? (
              <div className="flex-1 grid place-items-center text-sm text-danger">Unable to load documentation.</div>
            ) : (
              <>
                <DocList docs={filtered} search={search} sort={sort} selectedId={selectedId} onSearch={setSearch} onSort={setSort} onSelect={setSelectedId}/>
                <DocPreview doc={selectedDoc}/>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
