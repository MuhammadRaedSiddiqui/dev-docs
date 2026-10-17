"use client";

import { useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { ProjectUpdateSchema } from "@devdocs/shared";
import type { Project } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/lib/toast";
import s from "./dashboard.module.css";

interface Props {
  project: Project;
  returnFocus: HTMLButtonElement;
  onClose: () => void;
}

export function RenameProjectDialog({ project, returnFocus, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const rename = trpc.projects.update.useMutation();
  const normalized = name.trim();
  // Share the server's validation, including its length limit.
  const validation = ProjectUpdateSchema.safeParse({ name: normalized });
  const validationMessage = validation.success ? null : normalized.length === 0
    ? "Enter a project name."
    : validation.error.issues[0].code === "too_big"
      ? `Project name is too long. Use ${validation.error.issues[0].maximum} characters or fewer.`
      : "Enter a valid project name.";
  const unchanged = normalized === project.name.trim();

  useLayoutEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    input.current?.focus();
    input.current?.select();
    return () => {
      modal.close();
      if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  function dismiss() {
    // A submitted mutation continues on the server. Keep the UI available
    // until it settles so its outcome and any retry remain unambiguous.
    if (!submitting.current) onClose();
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !validation.success || unchanged) return;
    submitting.current = true;
    setError(null);
    try {
      const updated = await rename.mutateAsync({ id: project.id, data: validation.data });
      utils.projects.list.setData(undefined, rows => rows?.map(row => row.id === updated.id ? { ...row, name: updated.name, updatedAt: updated.updatedAt } : row));
      utils.projects.get.setData({ id: project.id }, previous => previous ? { ...previous, name: updated.name, updatedAt: updated.updatedAt } : previous);
      utils.documents.list.setData(undefined, rows => rows?.map(row => row.projectId === updated.id ? { ...row, projectName: updated.name } : row));
      void utils.projects.list.invalidate();
      void utils.projects.get.invalidate({ id: project.id });
      void utils.documents.list.invalidate();
      onClose();
      toast("Project renamed.", "success");
    } catch {
      setError("Could not rename this project. Your name has been kept. Please try saving again.");
    } finally {
      submitting.current = false;
    }
  }

  const message = validationMessage ?? error;
  return createPortal(
    <dialog ref={dialog} className={s.renameDialog} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); dismiss(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss();
      }}>
      <form onSubmit={save} noValidate aria-busy={rename.isPending}>
        <h2 id={`${id}-title`} className={s.dialogTitle}>Rename project</h2>
        <p id={`${id}-description`} className={s.dialogDescription}>Choose a name for this project.</p>
        <label htmlFor={`${id}-name`} className={s.dialogLabel}>Project name</label>
        <input ref={input} id={`${id}-name`} className={s.dialogInput} value={name} required readOnly={rename.isPending}
          aria-invalid={!!validationMessage} aria-describedby={message ? `${id}-error` : undefined}
          onChange={event => { setName(event.target.value); setError(null); }} />
        {message && <p id={`${id}-error`} role="alert" className={s.dialogError}>{message}</p>}
        {rename.isPending && <p role="status" className={s.dialogDescription}>Saving your name. Please wait before closing.</p>}
        <div className={s.dialogActions}>
          <button type="button" className={s.cancelButton} disabled={rename.isPending} onClick={dismiss}>Cancel</button>
          <button type="submit" className={s.primaryAction} disabled={rename.isPending || !validation.success || unchanged}>{rename.isPending ? "Saving…" : "Save changes"}</button>
        </div>
      </form>
    </dialog>, document.body,
  );
}
