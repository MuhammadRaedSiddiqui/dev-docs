"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import s from "./dashboard.module.css";

interface Props {
  projectName: string;
  canDownload: boolean;
  preparingDownload?: boolean;
  onRename: (trigger: HTMLButtonElement) => void;
  onDownload: () => void;
  onDelete: (trigger: HTMLButtonElement) => void;
}

// Match the application's inline SVG icon pattern without adding a dependency.
function ActionIcon({ kind }: { kind: "rename" | "download" | "delete" }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "rename" ? <><path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z" /></> : kind === "download" ? <><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4" /></> : <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>}
  </svg>;
}

export function ProjectActionsMenu({ projectName, canDownload, preparingDownload, onRename, onDownload, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; placement: "left" | "right" | "below"; arrowOffset: number | null } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<"first" | "last">("first");
  const id = useId();
  const positioned = position !== null;

  function close(returnFocus = false) {
    setOpen(false);
    setPosition(null);
    if (returnFocus) trigger.current?.focus();
  }
  function items() { return Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []); }

  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      if (!trigger.current || !menu.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const card = trigger.current.closest("article")?.getBoundingClientRect() ?? rect;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const width = Math.min(240, viewportWidth - 16);
      const height = (menu.current.firstElementChild as HTMLElement).scrollHeight + 2;
      // Every card uses the same right-first rule. Only viewport edges may
      // change placement; overlapping neighboring content is intentional.
      const right = card.right + 8;
      const left = card.left - width - 8;
      const placement = right + width <= viewportWidth - 8 ? "right" : left >= 8 ? "left" : "below";
      const x = placement === "right" ? right : placement === "left" ? left
        : Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8));
      const maxHeight = Math.max(0, viewportHeight - 16);
      const visibleHeight = Math.min(height, maxHeight);
      const preferredTop = placement === "below" ? rect.bottom + 8 : rect.top;
      const top = Math.max(8, Math.min(preferredTop, viewportHeight - visibleHeight - 8));
      const arrowOffset = rect.top + rect.height / 2 - top - 1;
      setPosition({ left: x, top, width, maxHeight, placement,
        // Hide the pointer if vertical shifting puts the trigger outside the
        // menu's edge; never point at a different location on the source card.
        arrowOffset: arrowOffset >= 12 && arrowOffset <= visibleHeight - 12 ? arrowOffset : null });
    }
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(menu.current!);
    observer.observe(trigger.current!);
    const anchorCard = trigger.current!.closest("article");
    if (anchorCard) observer.observe(anchorCard);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !positioned) return;
    const controls = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    (initialFocus.current === "last" ? controls.at(-1) : controls[0])?.focus();
  }, [open, positioned]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: Event) {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) {
        // Pointer/focus dismissal leaves focus with the control being activated.
        setOpen(false);
        setPosition(null);
      }
    }
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismiss);
    };
  }, [open]);

  function handleKey(event: KeyboardEvent) {
    const controls = items();
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
      controls[next]?.focus();
    }
    if (event.key === "Tab") {
      event.preventDefault();
      // The portal is at the end of body; resume the card's logical tab order.
      const tabbable = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter(el => el.tabIndex >= 0 && el.getClientRects().length && !menu.current?.contains(el));
      const index = tabbable.indexOf(trigger.current!);
      const next = event.shiftKey ? trigger.current : tabbable[(index + 1) % tabbable.length];
      close();
      next?.focus();
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== " ") {
      const match = controls.find(button => button.textContent?.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match) { event.preventDefault(); match.focus(); }
    }
  }

  return <>
    <button ref={trigger} type="button" aria-label={`Project actions for ${projectName}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      className={s.menuTrigger} onClick={() => { initialFocus.current = "first"; if (open) close(); else setOpen(true); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); initialFocus.current = event.key === "ArrowUp" ? "last" : "first"; setOpen(true); }
      }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
    </button>
    {open && createPortal(<div ref={menu} id={id} role="menu" aria-label={`Manage ${projectName}`} className={s.menu} data-placement={position?.placement}
      style={position ? { left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight } : { visibility: "hidden" }} onKeyDown={handleKey}>
      <div className={s.menuContents} style={position ? { maxHeight: position.maxHeight - 2 } : undefined}>
      <button type="button" role="menuitem" tabIndex={-1} className={s.menuItem} onClick={() => { close(true); onRename(trigger.current!); }}><ActionIcon kind="rename" />Rename project</button>
      <button type="button" role="menuitem" tabIndex={-1} disabled={!canDownload || preparingDownload} className={s.menuItem} onClick={() => { close(true); onDownload(); }}><ActionIcon kind="download" />{preparingDownload ? "Preparing documentation…" : "Download documentation"}</button>
      <div role="separator" className={s.menuDivider} />
      <button type="button" role="menuitem" tabIndex={-1} className={`${s.menuItem} ${s.destructiveItem}`} onClick={() => { close(true); onDelete(trigger.current!); }}><ActionIcon kind="delete" />Delete project</button>
      </div>
      {position && position.placement !== "below" && position.arrowOffset !== null && <span aria-hidden="true" className={s.menuArrow} style={{ top: position.arrowOffset }} />}
    </div>, document.body)}
  </>;
}
