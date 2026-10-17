"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { buildLibraryDocs } from "@/lib/docs-library";
import { SEARCH_LABEL, SearchModal } from "@/components/layout/SearchModal";
import { trpc } from "@/lib/trpc";
import type { Project } from "@/lib/types";

interface NavbarProps { active?: "projects" | "templates" | "docs"; userEmail?: string; userInitial?: string; }

const LINKS = [
  { id: "projects" as const, label: "Projects", href: "/dashboard" },
  { id: "templates" as const, label: "Templates", href: "/templates" },
  { id: "docs" as const, label: "Docs", href: "/docs" },
];

export function Navbar({ active }: Omit<NavbarProps, 'userEmail' | 'userInitial'>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const { signOut } = useClerk();
  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: searchOpen });
  const documentsQuery = trpc.documents.list.useQuery(undefined, { enabled: searchOpen });
  const documents = useMemo(
    () => buildLibraryDocs(documentsQuery.data ?? []),
    [documentsQuery.data],
  );

  const userEmail = user?.primaryEmailAddress?.emailAddress || "user@devdocs.ai";
  const userInitial = user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress[0]?.toUpperCase() || "U";

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false); }
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  useEffect(() => {
    const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    setIsMac(mac);
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, [role="textbox"], [role="combobox"]'));
      if (e.defaultPrevented || e.isComposing || typing || e.altKey || e.shiftKey || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      if ((mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <nav className="h-[52px] border-b border-hairline bg-sidebar-mist flex items-center px-4 gap-2 sm:gap-4 flex-shrink-0">
        <span className="text-[14px] font-medium text-ink">DevDocs</span>
        <div className="flex gap-0 sm:gap-1 sm:ml-2">
          {LINKS.map((l) => (
            <Link key={l.id} href={l.href} className={cn("px-2.5 py-1.5 text-[14px] rounded-lg transition-colors", active === l.id ? "text-ink font-medium bg-hover-veil" : "text-ink-muted hover:bg-hover-veil hover:text-ink")}>{l.label}</Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2.5 relative" ref={ref}>
          <button
            type="button"
            aria-label={SEARCH_LABEL}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[14px] text-ink-muted hover:bg-hover-veil"
          >
            <svg className="sm:hidden" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor"/><path d="m12 12 5 5" stroke="currentColor"/></svg>
            <kbd className="hidden sm:inline font-mono text-xs" aria-hidden="true">{isMac ? "⌘K" : "Ctrl+K"}</kbd><span className="hidden sm:inline">{SEARCH_LABEL}</span>
          </button>
          <button type="button" aria-label="Account menu" onClick={() => setMenuOpen((v) => !v)} className={cn("w-[30px] h-[30px] rounded-full bg-ink text-white flex items-center justify-center text-xs font-medium", menuOpen && "ring-2 ring-ink")}>
            {userInitial}
          </button>
          {menuOpen && (
            <div className="absolute top-[42px] right-0 bg-white border border-hairline rounded-lg p-1.5 min-w-[170px] z-30">
              <div className="px-2.5 py-2 text-xs text-ink-faint border-b border-vellum-border-light mb-1">{userEmail}</div>
              <Link href="/settings" className="block px-2.5 py-2 text-[14px] text-ink-secondary rounded-lg hover:bg-hover-veil">Settings</Link>
              <button type="button" onClick={() => signOut()} className="w-full text-left px-2.5 py-2 text-[14px] text-ink-secondary rounded-lg hover:bg-hover-veil">Sign out</button>
            </div>
          )}
        </div>
      </nav>
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        projects={(projectsQuery.data ?? []) as Project[]}
        docs={documents}
        loading={projectsQuery.isLoading || documentsQuery.isLoading || ((projectsQuery.isError || documentsQuery.isError) && (projectsQuery.isFetching || documentsQuery.isFetching))}
        error={projectsQuery.isError && documentsQuery.isError
          ? "Could not load projects and documents. Try again."
          : projectsQuery.isError ? "Could not load projects. Try again."
          : documentsQuery.isError ? "Could not load documents. Try again." : null}
        onRetry={() => {
          if (projectsQuery.isError) void projectsQuery.refetch();
          if (documentsQuery.isError) void documentsQuery.refetch();
        }}
      />
    </>
  );
}
