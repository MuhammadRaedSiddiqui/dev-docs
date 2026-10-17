"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo, useId, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import { PROJECT_TYPE_LABELS } from "@/lib/types";
import type { LibraryDoc } from "@/lib/docs-library";
import s from "./search.module.css";

export const SEARCH_LABEL = "Search projects and documents";

interface Props {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  docs: LibraryDoc[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

interface SearchResult {
  id: string;
  type: "project" | "document";
  label: string;
  meta: string;
  href: string;
}

function buildResults(query: string, projects: Project[], docs: LibraryDoc[]): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const p of projects) {
    const searchable = `${p.name} ${p.type} ${PROJECT_TYPE_LABELS[p.type]}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({
        id: `p-${p.id}`, type: "project", label: p.name,
        meta: PROJECT_TYPE_LABELS[p.type], href: `/project/${p.id}/interview`,
      });
    }
  }

  for (const d of docs) {
    const searchable = `${d.project} ${d.file} ${d.domainLabel} ${d.domainId}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({
        id: `d-${d.id}`, type: "document", label: d.file,
        meta: `${d.project} · ${d.domainLabel}`, href: `/docs?domain=${d.domainId}`,
      });
    }
  }

  return results;
}

export function SearchModal(props: Props) {
  // Mount a fresh search session on every open, as with the native rename dialog.
  return props.open ? <SearchDialog {...props} /> : null;
}

function SearchDialog({ onClose, projects, docs, loading, error, onRetry }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const hasQuery = !!query.trim();
  // Fetches supply the library, not query-specific responses. Always filter the
  // latest library against the current query, including when a fetch settles.
  const results = useMemo(
    () => query.trim() ? buildResults(query.trim(), projects, docs) : [],
    [query, projects, docs],
  );
  const active = results.find(result => result.id === selectedId) ?? results[0];
  const activeId = active?.id;

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    inputRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (activeId) document.getElementById(`${id}-${activeId}`)?.scrollIntoView({ block: "nearest" });
  }, [activeId, id]);

  function navigate(result: SearchResult) {
    router.push(result.href);
    onClose();
  }

  function handleInputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!results.length) return;
      const index = active ? results.indexOf(active) : 0;
      const next = Math.max(0, Math.min(index + (event.key === "ArrowDown" ? 1 : -1), results.length - 1));
      setSelectedId(results[next].id);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      navigate(active);
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className={s.panel}
      aria-modal="true"
      aria-label={SEARCH_LABEL}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => {
        // Keep Tab inside the search controls rather than moving to browser chrome.
        // Native modal behavior supplies inert background interaction and Escape.
        if (event.key !== "Tab") return;
        const controls = event.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled)');
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
    >
      <div className={s.header}>
        <div className={s.inputFrame}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="m12.5 12.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={SEARCH_LABEL}
            aria-autocomplete="list"
            aria-expanded={hasQuery && results.length > 0}
            aria-controls={`${id}-results`}
            aria-activedescendant={active ? `${id}-${active.id}` : undefined}
            aria-describedby={!hasQuery ? `${id}-instruction` : undefined}
            value={query}
            onChange={event => { setQuery(event.target.value); setSelectedId(null); }}
            onKeyDown={handleInputKey}
            placeholder={SEARCH_LABEL}
            autoComplete="off"
            spellCheck={false}
            className={s.input}
          />
        </div>
        <button type="button" onClick={onClose} aria-label="Close search" className={s.close}>
          <kbd aria-hidden="true">Esc</kbd>
        </button>
      </div>

      <div className={s.body}>
        {!hasQuery && <p id={`${id}-instruction`} className={s.message}>{SEARCH_LABEL} by name.</p>}
        {loading && <div role="status" className={s.loading}><span className={s.spinner} aria-hidden="true" />Loading search results…</div>}
        {error && (
          <div className={s.error}>
            <p role="alert">{error}</p>
            <button type="button" onClick={() => { onRetry(); inputRef.current?.focus(); }} disabled={loading} className={s.retry}>Retry</button>
          </div>
        )}
        {hasQuery && !loading && !error && results.length === 0 && (
          <div role="status" className={s.message}>
            <p className={s.emptyTitle}>No results found</p>
            <p>Try another project or document name.</p>
          </div>
        )}

        <div id={`${id}-results`} role="listbox" aria-label="Search results" aria-busy={loading}>
          {(["project", "document"] as const).map(type => {
            const group = results.filter(result => result.type === type);
            if (!group.length) return null;
            return (
              <div key={type} role="group" aria-labelledby={`${id}-${type}`} className={s.group}>
                <h2 id={`${id}-${type}`} className={s.groupLabel}>{type === "project" ? "Projects" : "Documents"}</h2>
                {group.map(result => (
                  <div
                    key={result.id}
                    id={`${id}-${result.id}`}
                    role="option"
                    aria-selected={result.id === active?.id}
                    className={s.result}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => navigate(result)}
                    onMouseEnter={() => setSelectedId(result.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" className={s.resultIcon}>
                      {type === "project"
                        ? <path d="M2.5 5.5h6l2 2h7v9h-15v-11Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                        : <path d="M5 2.5h6l4 4v11H5v-15Zm6 0v4h4M8 10h4m-4 3h4" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />}
                    </svg>
                    <div className={s.resultText}>
                      <div className={s.resultName}>{result.label}</div>
                      <div className={s.resultMeta}>{result.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
