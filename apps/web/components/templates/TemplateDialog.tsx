"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import s from "./templates.module.css";

interface Props {
  title: string;
  description: string;
  returnFocus: HTMLButtonElement;
  setup: boolean;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
}

export function TemplateDialog({ title, description, returnFocus, setup, onClose, children, actions }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const modal = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.showModal();
    return () => {
      modal.close();
      document.body.style.overflow = overflow;
      if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  useLayoutEffect(() => {
    if (setup) dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    else heading.current?.focus();
  }, [setup]);

  return createPortal(
    <dialog ref={dialog} className={s.dialog} aria-modal="true" aria-labelledby="template-dialog-title" aria-describedby="template-dialog-description"
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, input, select, textarea, summary, a[href], [tabindex]"))
          .filter(node => node.tabIndex >= 0 && !node.matches(":disabled") && node.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); heading.current?.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}>
      <div className={s.dialogLayout}>
        <header className={s.dialogHeader}>
          <h2 ref={heading} id="template-dialog-title" tabIndex={-1} className={s.dialogTitle}>{title}</h2>
          <p id="template-dialog-description" className={s.description}>{description}</p>
        </header>
        <div className={s.dialogContent} tabIndex={setup ? undefined : 0} role={setup ? undefined : "region"} aria-label={setup ? undefined : "Template details"}>{children}</div>
        <footer className={s.dialogActions}>{actions}</footer>
      </div>
    </dialog>, document.body,
  );
}
