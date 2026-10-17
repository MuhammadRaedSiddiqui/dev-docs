"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { DiscoveryForm } from '@/components/interview/DiscoveryForm';
import { ProjectPlan } from '@/components/interview/ProjectPlan';
import { QuestionPanel } from '@/components/interview/QuestionPanel';
import { DocumentationPanel } from '@/components/interview/DocumentationPanel';
import { InterviewSkeleton } from '@/components/interview/InterviewSkeleton';
import styles from '@/components/interview/interview.module.css';
import { useInterviewStore, interviewSnapshot } from '@/lib/interview/store';
import { setAISession, PROVIDER_MODELS, ACTIVE_PROVIDER_KEY } from '@/lib/ai/provider';
import { trpc } from '@/lib/trpc';
import type { DomainId, ProjectType } from '@/lib/types';
import { readSavedInterviewData } from '@/lib/interview/snapshot';
import { analytics } from '@/lib/analytics';

export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const store = useInterviewStore();
  const { getToken } = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const hasHydrated = useRef(false);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [section, setSection] = useState<DomainId | null>(null);
  const [saveError, setSaveError] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const projectQuery = trpc.projects.get.useQuery({ id: params.id }, { staleTime: 0, refetchOnMount: 'always' });
  const [bedrockModel, setBedrockModel] = useState<string | null>(null);
  const snapshotKey = JSON.stringify(interviewSnapshot(store));
  const operationBusy = store.isThinking || store.isStreaming;
  const saveImmediately = !!store.notice || !!store.pending || store.isComplete || store.followUpCount > 0;
  useEffect(() => { if (!operationBusy) useInterviewStore.getState().refreshProvider(); }, [operationBusy]);
  useEffect(() => {
    const refresh = () => useInterviewStore.getState().refreshProvider();
    const changed = (event: StorageEvent) => { if (event.key === ACTIVE_PROVIDER_KEY || event.key === null) refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', changed); };
  }, []);
  useEffect(() => {
    let active = true;
    void fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/ai/bedrock-status`).then(r => r.json()).then(data => { if (active) setBedrockModel(data.configured ? data.model : null); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    hasHydrated.current = false; setHydrated(false); setDocumentationOpen(false);
    useInterviewStore.getState().reset();
    return () => { const s = useInterviewStore.getState(); s.abortController?.abort(); };
  }, [params.id]);
  useEffect(() => {
    if (!projectQuery.data || projectQuery.isFetching || hasHydrated.current) return;
    const s = useInterviewStore.getState();
    const saved = readSavedInterviewData(projectQuery.data.interviewData);
    const canonical = Object.fromEntries((projectQuery.data.documents ?? []).map(d => [d.domainId, d.content])) as Partial<Record<DomainId, string>>;
    s.setProjectId(params.id); s.setTokenGetter(getToken); s.setProjectName(projectQuery.data.name);
    setAISession(params.id, getToken);
    s.refreshProvider();
    if (saved) {
      s.resumeFromSaved({ ...saved, domainContent: canonical });
      if (!useInterviewStore.getState().isComplete) void s.initializeSession(getToken);
    }
    hasHydrated.current = true; setHydrated(true);
  }, [projectQuery.data, projectQuery.isFetching, params.id, getToken]);
  // Serialized saves share the engine's checkpoint queue. A stale autosave
  // cannot overtake a submitted answer or a later completion.
  useEffect(() => {
    // The engine checkpoints an in-flight operation itself. Do not queue the
    // same snapshot again for each streaming/saving status update.
    if (!hydrated || !store.lockedContext || operationBusy) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const save = async () => {
      try { await useInterviewStore.getState().saveProgress(); if (!cancelled) setSaveError(false); }
      catch {
        if (cancelled) return;
        if (++attempts < 5) timer = setTimeout(() => void save(), Math.min(1000 * 2 ** attempts, 8000));
        else setSaveError(true);
      }
    };
    timer = setTimeout(() => void save(), saveImmediately ? 0 : 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [hydrated, snapshotKey, store.lockedContext, operationBusy, saveImmediately]);
  useEffect(() => {
    const abandon = () => {
      const s = useInterviewStore.getState(); if (!s.lockedContext || s.isComplete) return;
      try { analytics.interviewAbandoned(s.projectId ?? params.id, s.currentDomain, s.completedDomains.length, s.activeDomains.length, s.interviewStartAt ? Date.now() - s.interviewStartAt : 0, ''); } catch {}
    };
    window.addEventListener('beforeunload', abandon);
    return () => { window.removeEventListener('beforeunload', abandon); abandon(); };
  }, [params.id]);
  function closeDocumentation() { setDocumentationOpen(false); toggle.current?.focus(); }
  function viewSection(domain: DomainId) { setSection(domain); setDocumentationOpen(true); }
  if (projectQuery.error) return <div className="min-h-[100dvh] grid place-items-center"><div role="alert">Unable to load this project.<button type="button" onClick={() => void projectQuery.refetch()} className="block mt-3 underline">Try again</button></div></div>;
  if (projectQuery.isLoading || !hydrated || !projectQuery.data) return <InterviewSkeleton />;
  // Discovery keeps its approved layout; the replacement begins after setup.
  if (!store.lockedContext) return <div className="flex flex-col h-[100dvh] overflow-hidden">
    <header className="h-[52px] border-b border-hairline bg-sidebar-mist flex items-center px-4 md:px-7 gap-2.5 flex-shrink-0">
      <span className="font-medium text-[14px] text-ink">DevDocs</span>
      <span className="text-[13px] text-ink-muted hidden sm:inline">{projectQuery.data.name}</span>
      <div className="ml-auto flex items-center gap-2">
        {store.currentProvider && <span title="Per-project provider — stays on reload" className="text-[11px] px-2.5 py-1 rounded-full border border-vellum-border text-ink-faint bg-white hidden sm:inline">
          {{ anthropic: 'Anthropic', openai: 'OpenAI', bedrock: 'Bedrock', metamuse: 'Meta Muse' }[store.currentProvider]} <span className="opacity-60">· per-project</span>
        </span>}
        <span className="text-[11px] px-3 py-1 rounded-none font-medium bg-sidebar-mist border border-hairline text-ink">Project setup</span>
      </div>
    </header>
    <div className="flex-1 flex items-center justify-center overflow-hidden bg-white">
      <DiscoveryForm projectType={projectQuery.data.type as ProjectType} onSubmit={store.setLockedContext} />
    </div>
  </div>;
  const provider = store.currentProvider ?? 'anthropic';
  const model = provider === 'bedrock' ? bedrockModel ?? 'Bedrock model unavailable' : PROVIDER_MODELS[provider].label;
  const savedCount = Object.keys(store.domainContent).length;
  return <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.brand}><Link href="/dashboard">DevDocs AI</Link><span className={styles.projectName}>{projectQuery.data.name}</span></div>
      <div className={styles.headerControls}>
        <div className={styles.provider}>Project model
          <span className={styles.model} aria-label="Configured model and provider">{model} · {provider === 'metamuse' ? 'Meta' : provider}</span>
        </div>
        <button ref={toggle} className={styles.toggle} type="button" aria-label={`Documentation: ${documentationOpen ? 'close' : 'open'} panel${savedCount > 0 ? ` (${savedCount} saved sections)` : ''}`} aria-expanded={documentationOpen} aria-controls="interview-documentation" onClick={() => documentationOpen ? closeDocumentation() : setDocumentationOpen(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
          <span>Documentation{savedCount > 0 ? ` (${savedCount})` : ''}</span>
        </button>
      </div>
    </header>
    {saveError && <div className={styles.error} role="alert">Interview progress could not be synced. <button type="button" onClick={() => void store.saveProgress().then(() => setSaveError(false)).catch(() => setSaveError(true))}>Retry saving progress</button></div>}
      <div className={`${styles.layout} ${documentationOpen ? styles.withDocs : ''}`}>
        <ProjectPlan onViewSection={viewSection} />
        <QuestionPanel onViewSection={viewSection} />
        {documentationOpen && <DocumentationPanel selected={section} onSelect={setSection} onClose={closeDocumentation} />}
      </div>
  </div>;
}
