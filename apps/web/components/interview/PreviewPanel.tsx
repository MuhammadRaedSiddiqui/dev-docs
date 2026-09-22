"use client";
import { useState, useRef, useCallback } from "react";
import { useInterviewStore, selectFullDocument } from "@/lib/interview/store";
import { buildProjectZip } from "@/lib/export/buildZip";
import { MarkdownRenderer } from "@/components/ui/MarkdownRenderer";
import type { DomainId } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/lib/toast";

function parseDocumentSections(doc: string): { header: string; sections: string[] } {
  const parts = doc.split("\n\n---\n\n");
  return { header: parts[0] ?? "", sections: parts.slice(1) };
}

export function PreviewPanel() {
  const store = useInterviewStore();
  const { toast } = useToast();
  const { mutate: persistDocument } = trpc.documents.update.useMutation({
    onError: () => toast("Document edit could not be saved. Please try again.", "error"),
  });
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [editText, setEditText] = useState("");
  const [regenerating, setRegenerating] = useState<DomainId | null>(null);
  const [zipping, setZipping] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fullDoc = selectFullDocument(store);

  function toggleMode() {
    if (mode === "preview") {
      setEditText(fullDoc);
      setMode("edit");
      return;
    }
    setMode("preview");
  }

  const handleEditChange = useCallback((value: string) => {
    setEditText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const { sections } = parseDocumentSections(value);
      const activeDomains = store.activeDomains;
      sections.forEach((section, i) => {
        if (i < activeDomains.length) {
          const domainId = activeDomains[i].id;
          if (!store.completedDomains.includes(domainId)) return;
          const trimmed = section.replace(/\n\n---\n\n$/, "").trimEnd();
          store.setDomainContent(domainId, trimmed);
          if (store.projectId) {
            persistDocument({ projectId: store.projectId, domainId, content: trimmed });
          }
        }
      });
    }, 800);
  }, [store, persistDocument]);

  function handleRegenerate(domainId: DomainId) {
    setRegenerating(domainId);
    store.regenerateDomain(domainId);
    setTimeout(() => setRegenerating(null), 300);
  }

  function handleDownloadMd() {
    const doc = mode === "edit" ? editText : fullDoc;
    const blob = new Blob([doc], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "DOCUMENTATION.md";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function handleDownloadZip() {
    if (!store.lockedContext) return;
    setZipping(true);
    try {
      const blob = await buildProjectZip(store.lockedContext, store.domainContent);
      const slug = store.projectName.replace(/\s+/g, "-").toLowerCase() || "project";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${slug}-docs.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  return (
    <div className="flex-shrink-0 border-l border-hairline bg-sidebar-mist flex flex-col overflow-hidden w-[320px] max-md:!w-full max-md:!border-l-0">
      <div className="px-4 py-3 border-b border-hairline flex items-center gap-2 flex-shrink-0">
        <span className="font-serif-heading text-[13px] text-ink flex-1">DOCUMENTATION.md</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${store.isComplete ? "bg-ink text-white border-ink" : "bg-white text-ink-faint border-hairline"}`}>{store.completedDomains.length}/{store.activeDomains.length}</span>
        <button
          type="button"
          onClick={toggleMode}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${mode === "edit" ? "bg-ink text-white border-ink" : "bg-white text-ink-secondary border-hairline hover:bg-hover-veil"}`}
        >
          {mode === "edit" ? "Preview" : "Edit"}
        </button>
        <button type="button" onClick={handleDownloadMd} disabled={!store.isComplete} title={store.isComplete ? "Download markdown" : "Complete interview to download"} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-ink text-white text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed">
          ↓ .md
        </button>
        <button
          type="button"
          onClick={handleDownloadZip}
          disabled={zipping || !store.isComplete}
          title={store.isComplete ? "Download zip" : "Complete interview to download"}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-ink text-white text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {zipping ? <span className="inline-block w-3 h-3 border-2 border-vellum border-t-transparent rounded-full animate-spin" /> : "↓ .zip"}
        </button>
      </div>

      {mode === "edit" ? (
        <textarea
          value={editText}
          onChange={e => handleEditChange(e.target.value)}
          className="flex-1 w-full p-3.5 bg-white border-none text-ink font-mono text-xs leading-relaxed resize-none"
          spellCheck={false}
        />
      ) : (
        <div className="flex-1 overflow-y-auto p-3.5">
          {(() => {
            const { header, sections } = parseDocumentSections(fullDoc);
            const activeDomains = store.activeDomains;
            return (
              <>
                <MarkdownRenderer content={header} size="sm" />
                {sections.map((section, i) => {
                  const domainId = i < activeDomains.length ? activeDomains[i].id : null;
                  const isDone = domainId ? store.completedDomains.includes(domainId) : true;
                  if (regenerating === domainId) {
                    return (
                      <div key={i} className="flex items-center justify-center py-6 text-ink-faint text-[11px]">
                        <span className="inline-block w-3 h-3 border-2 border-ink-faint border-t-transparent rounded-full animate-spin mr-2" />
                        Regenerating...
                      </div>
                    );
                  }
                  return (
                    <div key={i} className={`relative group ${!isDone ? "opacity-60" : ""}`}>
                      <MarkdownRenderer content={section} size="sm" />
                      {!isDone && domainId && <div className="text-[10px] text-ink-faint mt-1">Not yet generated — will appear after {activeDomains.find(d=>d.id===domainId)?.label}</div>}
                      {domainId && isDone && (
                        <button
                          type="button"
                          onClick={() => handleRegenerate(domainId)}
                          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded-md text-[10px] text-ink-muted border border-vellum-border bg-white hover:text-ink hover:border-ink/30"
                        >
                          ↻ Regenerate
                        </button>
                      )}
                      {i < sections.length - 1 && <hr className="border-vellum-border-light my-3" />}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
