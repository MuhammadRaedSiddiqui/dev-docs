'use client';
import { useEffect, useRef, useState } from 'react';
import { useInterviewStore } from '@/lib/interview/store';
import { DOMAINS } from '@/lib/interview/domains';
import { buildSavedDocumentationZip } from '@/lib/export/buildZip';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';
import { trpc } from '@/lib/trpc';
import type { DomainId } from '@/lib/types';
import styles from './interview.module.css';

export function DocumentationPanel({ selected, onSelect, onClose }: { selected: DomainId | null; onSelect: (id: DomainId) => void; onClose: () => void }) {
  const s = useInterviewStore();
  const persist = trpc.documents.update.useMutation();
  const close = useRef<HTMLButtonElement>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [errorAction, setErrorAction] = useState<'save' | 'export'>('save');
  const [zipping, setZipping] = useState(false);
  const sections = DOMAINS.filter(d => s.domainContent[d.id] !== undefined);
  const domain = sections.find(d => d.id === selected) ?? sections[0];
  const dirty = Object.keys(s.documentDrafts).length > 0;
  const busy = s.isThinking || s.isStreaming || !!s.pending || persist.isPending;
  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => { setFeedback(''); setError(''); }, [selected]);
  async function save() {
    if (!domain || !s.projectId || s.documentDrafts[domain.id] === undefined || persist.isPending) return;
    const content = s.documentDrafts[domain.id]!;
    setError(''); setFeedback('Saving documentation…');
    try {
      const saved = await persist.mutateAsync({ projectId: s.projectId, domainId: domain.id, content });
      if (useInterviewStore.getState().projectId !== s.projectId) return;
      s.setDomainContent(domain.id, saved.content);
      if (useInterviewStore.getState().documentDrafts[domain.id] === content) s.setDocumentDraft(domain.id);
      setFeedback('Changes saved.');
    } catch { setFeedback(''); setErrorAction('save'); setError('Document edit could not be saved. Your draft is preserved. Please retry.'); }
  }
  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }
  async function exportZip() {
    if (dirty || busy || !sections.length) return;
    setZipping(true); setError('');
    try { download(await buildSavedDocumentationZip(sections.map(d => ({ domainId: d.id, content: s.domainContent[d.id]! }))), `${s.projectName.replace(/\s+/g, '-').toLowerCase() || 'project'}-docs.zip`); }
    catch { setErrorAction('export'); setError('Could not package documentation. Please retry.'); }
    finally { setZipping(false); }
  }
  return <section id="interview-documentation" aria-label="Saved documentation" className={styles.docs} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <div className={styles.docsHeader}><h2>Documentation</h2><button ref={close} className={styles.close} type="button" onClick={onClose} aria-label="Close documentation">Close</button></div>
    {!sections.length ? <p className={styles.empty}>Your documentation will appear here after you answer a domain and its section is saved.</p> : <>
      <p className={styles.metadata}>{sections.length} saved {sections.length === 1 ? 'section' : 'sections'}</p>
      <label htmlFor="saved-section" className={styles.answerLabel}>Saved section</label>
      <select id="saved-section" className={styles.docSelect} value={domain.id} onChange={e => onSelect(e.target.value as DomainId)}>{sections.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
      <div className={styles.docActions}>
        <button className={styles.secondary} type="button" disabled={persist.isPending} onClick={() => s.setDocumentEditing(!s.isEditingDocuments)}>{s.isEditingDocuments ? 'Preview saved section' : 'Edit section'}</button>
      </div>
      {s.isEditingDocuments ? <>
        <label htmlFor="document-edit" className={styles.answerLabel}>{domain.label} Markdown</label>
        <textarea className={styles.textarea} id="document-edit" aria-label={`${domain.label} documentation`} value={s.documentDrafts[domain.id] ?? s.domainContent[domain.id] ?? ''} onChange={e => s.setDocumentDraft(domain.id, e.target.value)} disabled={persist.isPending} />
        <div className={styles.docActions}>
          <button className={styles.primary} type="button" disabled={busy || s.documentDrafts[domain.id] === undefined} onClick={() => void save()}>Save changes</button>
          <button className={styles.secondary} type="button" disabled={persist.isPending || s.documentDrafts[domain.id] === undefined} onClick={() => { s.setDocumentDraft(domain.id); setError(''); }}>Discard changes</button>
        </div>
      </> : <div className={styles.markdown}><MarkdownRenderer content={s.domainContent[domain.id] ?? ''} /></div>}
      {dirty && <p className={styles.metadata}>Unsaved edits are kept separately. Save or discard all edits before exporting.</p>}
      <div className={styles.docActions}>
        <button className={styles.secondary} type="button" disabled={dirty || busy} onClick={() => download(new Blob([sections.map(d => s.domainContent[d.id]).join('\n\n---\n\n')], { type: 'text/markdown' }), 'DOCUMENTATION.md')}>Export .md</button>
        <button className={styles.secondary} type="button" disabled={dirty || busy || zipping} onClick={() => void exportZip()}>{zipping ? 'Packaging…' : 'Export .zip'}</button>
      </div>
      <p className={styles.metadata}>Exports include all saved sections, including partial plans.</p>
      <details className={styles.example}><summary>Replace this section</summary>
        <p>Generate a replacement using your confirmed answers. This replaces saved manual edits in this section.</p>
        <button className={styles.secondary} type="button" disabled={dirty || busy} onClick={() => s.regenerateDomain(domain.id)}>Regenerate {domain.label}</button>
      </details>
    </>}
    <p className={styles.status} role="status">{feedback || (s.status === 'saving' ? 'Saving documentation…' : s.status === 'generating' ? 'Generating documentation…' : '')}</p>
    {(error || s.lastError) && <div className={styles.error} role="alert"><p>{error || s.lastError?.message}</p><button className={styles.secondary} type="button" disabled={persist.isPending || s.isThinking || s.isStreaming} onClick={() => error ? void (errorAction === 'save' ? save() : exportZip()) : s.retryLast()}>Retry</button></div>}
  </section>;
}
