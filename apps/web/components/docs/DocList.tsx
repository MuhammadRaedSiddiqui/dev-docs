"use client";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import type { LibraryDoc } from "@/lib/docs-library";

interface ListProps { docs:LibraryDoc[]; search:string; sort:"recent"|"project"|"domain"; selectedId:string|null; onSearch:(v:string)=>void; onSort:(v:"recent"|"project"|"domain")=>void; onSelect:(id:string)=>void; }

export function DocList({docs,search,sort,selectedId,onSearch,onSort,onSelect}:ListProps) {
  let list=[...docs];
  if(search){const q=search.toLowerCase();list=list.filter(d=>d.domainLabel.toLowerCase().includes(q)||d.project.toLowerCase().includes(q)||d.file.toLowerCase().includes(q)||d.snippet.toLowerCase().includes(q));}
  if(sort==="recent") list.sort((a,b)=>a.order-b.order);
  else if(sort==="project") list.sort((a,b)=>a.project.localeCompare(b.project)||a.order-b.order);
  else list.sort((a,b)=>a.domainLabel.localeCompare(b.domainLabel));
  return (
    <div className="w-full md:w-[360px] flex-shrink-0 border-r border-vellum-border flex flex-col overflow-hidden min-h-0">
      <div className="px-4 pt-3.5 pb-2.5 border-b border-vellum-border-light flex-shrink-0">
        <input type="text" value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search documents..." className="w-full px-3 py-2 border border-ink/15 rounded-lg text-[13px] bg-vellum text-ink mb-2 focus:outline-none focus:border-ink/30 focus:bg-white"/>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-ink-faint">{list.length} document{list.length!==1?"s":""}</span>
          <div className="flex gap-1">
            {(["recent","project","domain"] as const).map(s=>(
              <button key={s} type="button" onClick={()=>onSort(s)} className={cn("px-2 py-1 text-[11px] rounded-lg border capitalize",sort===s?"bg-ink text-white border-ink":"bg-white text-ink-muted border-hairline hover:bg-hover-veil")}>{s}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {list.length===0?(
          <div className="p-10 text-center text-ink-faint text-xs">No documents match your search or filter.</div>
        ):list.map(d=>(
          <button key={d.id} type="button" onClick={()=>onSelect(d.id)} className={cn("w-full text-left px-4 py-3 border-b border-hairline border-l-2 transition-colors",selectedId===d.id?"bg-hover-veil border-l-ink":"border-l-transparent hover:bg-sidebar-mist")}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-mono text-[12.5px] font-medium text-ink">{d.file}</span>
              <span className="text-[10.5px] text-ink-faint whitespace-nowrap ml-2 flex-shrink-0">{d.date}</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded-none font-medium bg-sidebar-mist text-ink">{d.project}</span>
              <span className="text-[11px] text-ink-faint">{d.domainLabel}</span>
            </div>
            <div className="text-[11.5px] text-ink-muted truncate">{d.snippet}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

interface PreviewProps { doc: LibraryDoc|null; }
export function DocPreview({doc}:PreviewProps) {
  if(!doc) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 text-ink-faint text-center">
      <div className="text-3xl">◇</div>
      <p className="text-[13px] leading-snug max-w-[220px]">Select a document from the list to preview it here.</p>
    </div>
  );
  function handleDownload() {
    if(!doc) return;
    const blob=new Blob([doc.content],{type:"text/markdown"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=doc.file;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div className="px-5 py-3.5 border-b border-vellum-border-light flex items-center justify-between flex-shrink-0">
        <div>
          <div className="font-mono text-sm font-medium text-ink">{doc.file}</div>
          <div className="text-[11.5px] text-ink-faint mt-0.5">{doc.project} · {doc.domainLabel} · generated {doc.date}</div>
        </div>
        <button type="button" onClick={handleDownload} className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-ink text-vellum text-xs font-medium">↓ Download</button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <MarkdownRenderer content={doc.content} size="md" />
      </div>
    </div>
  );
}
