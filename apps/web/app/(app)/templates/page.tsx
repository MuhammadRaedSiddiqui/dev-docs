"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { TEMPLATES, type Template } from "@/lib/templates";
import { PROJECT_TYPE_LABELS } from "@/lib/types";
import { PROJECT_TYPE_BADGE_CLASS } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export default function TemplatesPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const createProject = trpc.projects.create.useMutation();
  const updateProject = trpc.projects.update.useMutation();

  function handleUse(template: Template) {
    setSelected(template);
    setName("");
  }

  async function handleCreate() {
    if (!selected || !name.trim() || creating) return;
    setCreating(true);
    try {
      const project = await createProject.mutateAsync({ name: name.trim(), type: selected.projectType });
      await updateProject.mutateAsync({
        id: project.id,
        data: {
          interviewData: {
            lockedContext: selected.lockedContext,
            lockedChoices: selected.lockedChoices,
            completedDomains: [],
            conversationHistory: [],
            elaboration: selected.elaboration,
          },
        },
      });
      setSelected(null);
      router.push(`/project/${project.id}/interview`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar active="templates" />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[260px] flex-shrink-0 border-r border-hairline bg-sidebar-mist flex flex-col py-4 overflow-y-auto hidden md:flex">
          <div className="px-4 mb-5">
            <Link
              href="/dashboard"
              className="w-full py-2 px-2.5 bg-white border border-hairline rounded-lg text-[14px] font-medium flex items-center gap-2 text-ink-secondary hover:bg-hover-veil transition-colors"
            >
              ← Back to projects
            </Link>
          </div>
          <div className="px-5">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-faint mb-2">About templates</div>
            <p className="text-[12px] text-ink-muted leading-relaxed">
              Templates pre-fill your choices so the interview focuses on what matters for your project type.
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-8 py-7">
          <div className="mb-6">
            <h1 className="font-serif-heading text-2xl text-ink mb-1">Templates</h1>
            <p className="text-[13px] text-ink-muted">Start from a proven foundation. Pick a template and customize it during the interview.</p>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {TEMPLATES.map(t => (
              <div key={t.id} className="border border-hairline rounded-lg bg-white p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-none font-medium bg-sidebar-mist text-ink">
                    {PROJECT_TYPE_LABELS[t.projectType]}
                  </span>
                </div>
                <h3 className="font-serif-heading text-[15px] text-ink mb-1.5">{t.name}</h3>
                <p className="text-[12px] text-ink-muted leading-relaxed mb-4 flex-1">{t.description}</p>
                <button
                  type="button"
                  onClick={() => handleUse(t)}
                  className="w-full py-2 px-3 bg-ink text-white rounded-lg text-[14px] font-medium hover:bg-ink-press transition-colors"
                >
                  Use this template →
                </button>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Name modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-ink/40 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div className="bg-white border border-hairline rounded-lg w-[420px] overflow-hidden">
            <div className="px-6 pt-5 pb-4 border-b border-vellum-border">
              <h3 className="font-serif-heading text-lg text-ink">Name your project</h3>
              <p className="text-[13px] text-ink-muted mt-1">
                Using template: <strong className="text-ink">{selected.name}</strong>
              </p>
            </div>
            <div className="px-6 py-5">
              <label htmlFor="tmpl-name" className="block text-[13px] font-medium text-ink mb-1.5">Project name</label>
              <input
                id="tmpl-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="e.g. My SaaS App"
                autoFocus
                className="w-full px-3 py-2.5 border border-ink/15 rounded-vellum text-[13px] bg-white text-ink focus:outline-none focus:border-ink/30"
              />
            </div>
            <div className="px-6 py-3.5 border-t border-vellum-border flex gap-2 justify-end bg-white">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 border border-vellum-border rounded-lg text-[13px] bg-white text-ink-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!name.trim() || creating}
                onClick={handleCreate}
                className="px-5 py-2 bg-ink text-vellum rounded-lg text-[13px] font-medium disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {creating ? "Creating..." : "Start planning →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
