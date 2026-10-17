"use client";

import { useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/lib/toast";
import s from "./dashboard.module.css";

interface Props {
  project: Project;
  returnFocus: HTMLButtonElement;
  onClose: () => void;
}

export function DeleteProjectDialog({ project, returnFocus, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const utils = trpc.useUtils();
  const { toast } = useToast();
  const deletion = trpc.projects.delete.useMutation();

  useLayoutEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    cancel.current?.focus();
    return () => {
      modal.close();
      if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [returnFocus]);

  function dismiss() {
    if (!submitting.current) onClose();
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    try {
      await deletion.mutateAsync({ id: project.id });
      utils.projects.list.setData(undefined, rows => rows?.filter(row => row.id !== project.id));
      utils.documents.list.setData(undefined, rows => rows?.filter(row => row.projectId !== project.id));
      void utils.projects.list.invalidate();
      void utils.documents.list.invalidate();
      onClose();
      toast("Project deleted.", "success");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete project. Please try again.");
    } finally {
      submitting.current = false;
    }
  }

  return createPortal(
    <dialog ref={dialog} className={s.renameDialog} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      onCancel={event => { event.preventDefault(); dismiss(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss();
      }}>
      <form onSubmit={confirm} aria-busy={deletion.isPending}>
        <h2 id={`${id}-title`} className={s.dialogTitle}>Delete project</h2>
        <p id={`${id}-description`} className={s.dialogDescription}>
          <strong className={s.deleteProjectName}>{project.name}</strong> and its saved documentation will be removed from your workspace.
        </p>
        {error && <p role="alert" className={s.dialogError}>{error}</p>}
        {deletion.isPending && <p role="status" className={s.dialogDescription}>Deleting project…</p>}
        <div className={s.dialogActions}>
          <button ref={cancel} type="button" className={s.cancelButton} disabled={deletion.isPending} onClick={dismiss}>Cancel</button>
          <button type="submit" className={`${s.primaryAction} ${s.deleteAction}`} disabled={deletion.isPending}>{deletion.isPending ? "Deleting…" : "Delete project"}</button>
        </div>
      </form>
    </dialog>, document.body,
  );
}
