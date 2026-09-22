"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useUser, useClerk } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { buildLibraryDocs } from "@/lib/docs-library";
import { SearchModal } from "@/components/layout/SearchModal";
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
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <nav className="h-[52px] border-b border-hairline bg-sidebar-mist flex items-center px-4 gap-4 flex-shrink-0">
        <span className="text-[14px] font-medium text-ink">DevDocs</span>
        <div className="flex gap-1 ml-2">
          {LINKS.map((l) => (
            <Link key={l.id} href={l.href} className={cn("px-2.5 py-1.5 text-[14px] rounded-lg transition-colors", active === l.id ? "text-ink font-medium bg-hover-veil" : "text-ink-muted hover:bg-hover-veil hover:text-ink")}>{l.label}</Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2.5 relative" ref={ref}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[14px] text-ink-muted hover:bg-hover-veil"
          >
            <span>⌘K</span><span>Search projects</span>
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
      />
    </>
  );
}
