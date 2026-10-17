"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { TemplateDialog } from "@/components/templates/TemplateDialog";
import { discoveryDefaults, interviewDefaults, templateMetadata } from "@/components/templates/template-details";
import s from "@/components/templates/templates.module.css";
import { TEMPLATES, type Template } from "@/lib/templates";
import { PROJECT_TYPE_LABELS, type ProjectContext } from "@/lib/types";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/lib/toast";

export default function TemplatesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [preview, setPreview] = useState<Template | null>(null);
  const [selected, setSelected] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [context, setContext] = useState<ProjectContext | null>(null);
  const [choices, setChoices] = useState<Template["lockedChoices"]>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const submitting = useRef(false);
  const createProject = trpc.projects.create.useMutation();
  const updateProject = trpc.projects.update.useMutation();

  function handleUse(template: Template) {
    if (submitting.current) return;
    setPreview(null);
    setPendingProjectId(null);
    setSelected(template);
    setName("");
    setContext({ ...template.lockedContext });
    setChoices(Object.fromEntries(Object.entries(template.lockedChoices).map(([domain, fields]) => [domain, { ...fields }])));
    setError(null);
  }

  function closeDialog() {
    if (submitting.current) return;
    setPreview(null);
    setSelected(null);
  }

  async function handleCreate() {
    if (!selected || !context || !name.trim() || submitting.current) return;
    submitting.current = true;
    setCreating(true);
    setError(null);
    try {
      const project = pendingProjectId ? { id: pendingProjectId } : await createProject.mutateAsync({ name: name.trim(), type: selected.projectType });
      setPendingProjectId(project.id);
      await updateProject.mutateAsync({
        id: project.id,
        data: {
          name: name.trim(),
          interviewData: {
            lockedContext: context,
            lockedChoices: choices,
            completedDomains: [],
            conversationHistory: [],
            elaboration: selected.elaboration,
          },
        },
      });
      setSelected(null);
      router.push(`/project/${project.id}/interview`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create project. Please try again.";
      setError(message);
      toast(message, "error");
    } finally {
      submitting.current = false;
      setCreating(false);
    }
  }

  const active = preview ?? selected;

  return (
    <div className={s.page}>
      <Navbar active="templates" />
      <main className={s.main}>
        <div className={s.content}>
          <Link href="/dashboard" className={s.back}><span aria-hidden="true">←</span> Back to projects</Link>
          <header className={s.header}>
            <h1 className={s.heading}>Templates</h1>
            <p className={s.description}>Choose a starting point, then customize your project.</p>
          </header>
          <div className={s.grid}>
            {TEMPLATES.map(template => (
              <article key={template.id} className={s.card} aria-labelledby={`template-${template.id}`}>
                <span className={s.badge}>{PROJECT_TYPE_LABELS[template.projectType]}</span>
                <h2 id={`template-${template.id}`} className={s.title}>{template.name}</h2>
                <p className={s.description}>{template.description}</p>
                <dl className={s.metadata}>
                  {templateMetadata(template).map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
                </dl>
                <div className={s.cardActions}>
                  <button type="button" className={s.button} aria-haspopup="dialog" onClick={event => { returnFocus.current = event.currentTarget; handleUse(template); }}>Start with template</button>
                  <button type="button" className={s.textButton} aria-haspopup="dialog" onClick={event => { returnFocus.current = event.currentTarget; setPreview(template); }}>View details</button>
                  <p className={s.helper}>Opens project setup with editable defaults.</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      {active && returnFocus.current && (
        <TemplateDialog title={preview ? preview.name : "Name your project"} description={preview ? preview.description : `Using template: ${selected!.name}`}
          returnFocus={returnFocus.current} setup={!!selected} onClose={closeDialog}
          actions={preview ? <>
            <p className={s.helper}>Opens project setup with editable defaults.</p>
            <button type="button" className={s.primary} onClick={() => handleUse(preview)}>Start with template</button>
            <button type="button" className={s.button} onClick={closeDialog}>Close</button>
          </> : <>
            <button type="submit" form="template-setup" disabled={!name.trim() || creating} className={s.primary}>{creating ? "Creating..." : "Start planning →"}</button>
            <button type="button" disabled={creating} className={s.button} onClick={closeDialog}>Cancel</button>
          </>}>
          {preview ? <>
            <section className={s.section}>
              <h3>Project defaults</h3>
              <dl className={s.detailRows}><div><dt>Project type</dt><dd>{PROJECT_TYPE_LABELS[preview.projectType]}</dd></div></dl>
            </section>
            {discoveryDefaults(preview.lockedContext).length > 0 && <section className={s.section}>
              <h3>Discovery defaults</h3>
              <p className={s.helper}>The timeline is a prefilled planning preference, not a delivery estimate.</p>
              <dl className={s.detailRows}>{discoveryDefaults(preview.lockedContext).map(field => <div key={field.key}><dt>{field.label}</dt><dd>{field.displayValue}</dd></div>)}</dl>
            </section>}
            {interviewDefaults(preview.lockedChoices).length > 0 && <section className={s.section}>
              <h3>Interview &amp; technology defaults</h3>
              <dl className={s.detailRows}>{interviewDefaults(preview.lockedChoices).map(choice => <div key={`${choice.domain}-${choice.key}`}><dt>{choice.label}</dt><dd>{choice.displayValue}</dd></div>)}</dl>
            </section>}
            {preview.elaboration && <section className={s.section}><h3>Project description default</h3><p className={s.description}>{preview.elaboration}</p></section>}
            <p className={s.note}>These are prefilled planning choices, not implemented features or code. You can edit the discovery and technology defaults in project setup before you start planning. Viewing these details does not create a project.</p>
          </> : context && <form id="template-setup" aria-busy={creating} onSubmit={event => { event.preventDefault(); void handleCreate(); }}>
            <label className={s.field}>Project name
              <input type="text" value={name} disabled={creating} onChange={event => setName(event.target.value)} placeholder="e.g. My SaaS App" autoComplete="off" />
            </label>
            <p className={s.helper}>Name your project, optionally edit its defaults, then start planning.</p>
            <details className={s.customize}>
              <summary>Customize defaults</summary>
              <section className={s.section}>
                <h3>Discovery defaults</h3>
                {discoveryDefaults(context).map(field => <label key={field.key} className={s.field}>{field.label}
                  <select value={field.value} disabled={creating} onChange={event => setContext({ ...context, [field.key]: event.target.value })}>
                    {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>)}
              </section>
              {interviewDefaults(choices).length > 0 && <section className={s.section}>
                <h3>Interview &amp; technology defaults</h3>
                {interviewDefaults(choices).map(choice => <label key={`${choice.domain}-${choice.key}`} className={s.field}>{choice.label}
                  <select value={choice.value} disabled={creating} onChange={event => setChoices(current => ({ ...current, [choice.domain]: { ...current[choice.domain], [choice.key]: event.target.value } }))}>
                    {!choice.options.some(option => option.id === choice.value) && <option value={choice.value}>{choice.displayValue}</option>}
                    {choice.options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </label>)}
              </section>}
            </details>
            {error && <p role="alert" className={s.error}>{error}</p>}
          </form>}
        </TemplateDialog>
      )}
    </div>
  );
}
