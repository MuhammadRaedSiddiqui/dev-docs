"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DiscoveryForm } from "@/components/interview/DiscoveryForm";
import { DomainProgress } from "@/components/interview/DomainProgress";
import { ChatPanel } from "@/components/interview/ChatPanel";
import { PreviewPanel } from "@/components/interview/PreviewPanel";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { InterviewSkeleton } from "@/components/interview/InterviewSkeleton";
import { useInterviewStore } from "@/lib/interview/store";
import { getActiveConfig } from "@/lib/ai/provider";
import { setAISession } from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/provider";
import { trpc } from "@/lib/trpc";
import type { ChatMessage, DomainId, ProjectContext, ProjectType } from "@/lib/types";
import { useAuth } from "@clerk/nextjs";
import { useToast } from "@/lib/toast";
import { analytics } from "@/lib/analytics";

const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  bedrock: "Bedrock",
  metamuse: "Meta Muse",
};

type SavedInterviewData = {
  lockedContext?: ProjectContext | null;
  lockedChoices?: Partial<Record<DomainId, Record<string, string>>>;
  completedDomains?: DomainId[];
  domainContent?: Partial<Record<DomainId, string>>;
  conversationHistory?: ChatMessage[];
  elaboration?: string;
};

function readSavedInterviewData(value: unknown): SavedInterviewData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SavedInterviewData;
}

export default function InterviewPage({ params }: { params: { id: string } }) {
  const store = useInterviewStore();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [hydrated, setHydrated] = useState(false);
  const hasHydrated = useRef(false);
  const [domainsSheet, setDomainsSheet] = useState(false);
  const [previewSheet, setPreviewSheet] = useState(false);
  const projectQuery = trpc.projects.get.useQuery({ id: params.id });
  const saveInterview = trpc.projects.update.useMutation();
  const queuedSave = useRef<Parameters<typeof saveInterview.mutateAsync>[0] | null>(null);
  const saveInFlight = useRef(false);
  const retryTimer = useRef<number | null>(null);
  const saveRetryCount = useRef(0);
  const activeProjectId = useRef(params.id);
  const saveInterviewAsync = saveInterview.mutateAsync;

  const flushQueuedSave = useCallback(async () => {
    if (saveInFlight.current || !queuedSave.current) return;

    if (retryTimer.current) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }

    const nextSave = queuedSave.current;
    queuedSave.current = null;
    saveInFlight.current = true;
    let succeeded = false;
    try {
      await saveInterviewAsync(nextSave);
      succeeded = true;
      saveRetryCount.current = 0;
    } catch {
      // Preserve the latest snapshot and retry even if the user makes no
      // further state changes. Never requeue a save for a project left behind.
      if (activeProjectId.current === nextSave.id) {
        if (!queuedSave.current) queuedSave.current = nextSave;
        saveRetryCount.current += 1;
        if (saveRetryCount.current <= 5) {
          const delay = Math.min(1_000 * 2 ** (saveRetryCount.current - 1), 8_000);
          retryTimer.current = window.setTimeout(() => {
            retryTimer.current = null;
            void flushQueuedSave();
          }, delay);
        } else {
          toast("Interview changes could not be saved. Check your connection and try again.", "error");
        }
      }
    } finally {
      saveInFlight.current = false;
    }

    if (succeeded && queuedSave.current) {
      void flushQueuedSave();
    }
  }, [saveInterviewAsync, toast]);

  const pct = Math.round(store.completedDomains.length / store.activeDomains.length * 100);

  useEffect(() => {
    activeProjectId.current = params.id;
    queuedSave.current = null;
    saveRetryCount.current = 0;
    if (retryTimer.current) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    hasHydrated.current = false;
    setHydrated(false);
    useInterviewStore.getState().reset();
    return () => {
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, [params.id]);

  useEffect(() => {
    if (!projectQuery.data || hasHydrated.current) return;

    const saved = readSavedInterviewData(projectQuery.data.interviewData);
    const canonicalContent = Object.fromEntries(
      (projectQuery.data.documents ?? []).map(document => [document.domainId, document.content]),
    ) as Partial<Record<DomainId, string>>;
    const restoredContent = { ...(saved?.domainContent ?? {}), ...canonicalContent };

    // Set up token getter and project ID immediately
    store.setProjectId(params.id);
    store.setTokenGetter(getToken);
    store.setProjectName(projectQuery.data.name);
    setAISession(params.id, getToken);
    const config = getActiveConfig();
    if (config) store.setProvider(config.provider);

    if (saved?.lockedContext) {
      const hasProgress = (saved.conversationHistory ?? []).length > 0
        || (saved.completedDomains ?? []).length > 0
        || Object.keys(restoredContent).length > 0;
      if (hasProgress) {
        store.resumeFromSaved({
          lockedContext: saved.lockedContext,
          lockedChoices: saved.lockedChoices ?? {},
          completedDomains: saved.completedDomains ?? [],
          domainContent: restoredContent,
          conversationHistory: saved.conversationHistory ?? [],
          elaboration: saved.elaboration ?? "",
        });
        const s = useInterviewStore.getState();
        if (!s.isComplete) {
          // Restore card picker if hydration stripped it (refresh mid-cards)
          s.replayOpenerForCurrentDomain();
          void s.initializeSession(getToken);
        }
      } else {
        store.resumeFromSaved({
          lockedContext: saved.lockedContext,
          lockedChoices: saved.lockedChoices ?? {},
          completedDomains: [],
          domainContent: {},
          conversationHistory: [],
          elaboration: saved.elaboration ?? "",
        });
        store.setLockedContext(saved.lockedContext);
      }
    }

    hasHydrated.current = true;
    setHydrated(true);
  }, [projectQuery.data, params.id, getToken, store]);

  useEffect(() => {
    if (!hydrated || !store.lockedContext) return;

    const timeout = window.setTimeout(() => {
      queuedSave.current = {
        id: params.id,
        data: {
          status: store.isComplete ? "complete" : "in_progress",
          interviewData: {
            lockedContext: store.lockedContext,
            lockedChoices: store.lockedChoices,
            completedDomains: store.completedDomains,
            conversationHistory: store.messages,
            elaboration: store.elaboration,
          },
        },
      };
      if (!saveInFlight.current) saveRetryCount.current = 0;
      void flushQueuedSave();
    }, store.isComplete ? 0 : 500);

    return () => window.clearTimeout(timeout);
  }, [
    hydrated,
    params.id,
    store.lockedContext,
    store.lockedChoices,
    store.completedDomains,
    store.messages,
    store.elaboration,
    store.isComplete,
    flushQueuedSave,
  ]);

  // Observability: interview abandoned
  useEffect(() => {
    const handleAbandon = () => {
      const s = useInterviewStore.getState();
      if (!s.lockedContext || s.isComplete) return;
      const elapsed = s.interviewStartAt ? Date.now() - s.interviewStartAt : 0;
      try {
        analytics.interviewAbandoned(s.projectId ?? params.id, s.currentDomain, s.completedDomains.length, s.activeDomains.length, elapsed, "");
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") handleAbandon();
    };
    window.addEventListener("beforeunload", handleAbandon);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleAbandon);
      document.removeEventListener("visibilitychange", onVisibility);
      // Component unmount (navigation away) also counts as abandon if not complete
      handleAbandon();
    };
  }, [params.id]);

  if (projectQuery.isLoading || !hydrated) {
    return <InterviewSkeleton />;
  }

  if (projectQuery.error || !projectQuery.data) {
    return <div className="min-h-[100dvh] grid place-items-center text-sm text-danger">Unable to load this project.</div>;
  }

  const projectType = projectQuery.data.type as ProjectType;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      <header className="h-[52px] border-b border-hairline bg-sidebar-mist flex items-center px-4 md:px-7 gap-2.5 flex-shrink-0">
        <span className="font-medium text-[14px] text-ink">DevDocs</span>
        <span className="text-[13px] text-ink-muted hidden sm:inline">{projectQuery.data.name}</span>
        <div className="ml-auto flex items-center gap-2">
          {store.currentProvider && (
            <span title="Per-project provider — stays on reload" className="text-[11px] px-2.5 py-1 rounded-full border border-vellum-border text-ink-faint bg-white hidden sm:inline">
              {PROVIDER_LABELS[store.currentProvider] ?? store.currentProvider} <span className="opacity-60">· per-project</span>
            </span>
          )}
            <span className="text-[11px] px-3 py-1 rounded-none font-medium bg-sidebar-mist border border-hairline text-ink">
            {pct}%
          </span>
        </div>
      </header>

      {!store.lockedContext ? (
        <div className="flex-1 flex items-center justify-center overflow-hidden bg-white">
          <DiscoveryForm projectType={projectType} onSubmit={store.setLockedContext} />
        </div>
      ) : (
        <>
          {/* Desktop: three-panel layout */}
          <div className="hidden md:flex flex-row h-[calc(100dvh-52px)] overflow-hidden">
            <DomainProgress onRevisit={(id) => { const label = store.activeDomains.find(d=>d.id===id)?.label ?? id; toast(`Rewound to ${label}`, "info"); }} />
            <ChatPanel />
            <PreviewPanel />
          </div>

          {/* Mobile: chat only + bottom nav */}
          <div className="flex md:hidden flex-col h-[calc(100dvh-52px-56px)] overflow-hidden">
            <ChatPanel />
          </div>

          {/* Mobile bottom navigation */}
          <div className="md:hidden h-14 border-t border-vellum-border bg-vellum flex items-center justify-around flex-shrink-0">
            <button
              type="button"
              onClick={() => setDomainsSheet(true)}
              className="flex flex-col items-center gap-0.5 text-ink-muted"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-ink-muted">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[10px]">Domains</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewSheet(true)}
              className="flex flex-col items-center gap-0.5 text-ink-muted"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-ink-muted">
                  <path d="M4 3h8l4 4v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              <span className="text-[10px]">Document {store.completedDomains.length}/{store.activeDomains.length}</span>
            </button>
          </div>

          {/* Bottom sheets for mobile */}
          <BottomSheet open={domainsSheet} onClose={() => setDomainsSheet(false)} title="Interview Progress">
            <DomainProgress onRevisit={(id) => { setDomainsSheet(false); const label = store.activeDomains.find(d=>d.id===id)?.label ?? id; toast(`Rewound to ${label}`, "info"); }} />
          </BottomSheet>
          <BottomSheet open={previewSheet} onClose={() => setPreviewSheet(false)} title="DOCUMENTATION.md">
            <PreviewPanel />
          </BottomSheet>
        </>
      )}
    </div>
  );
}
