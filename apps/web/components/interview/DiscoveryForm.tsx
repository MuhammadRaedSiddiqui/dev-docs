"use client";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProjectContext, ProjectType } from "@/lib/types";
import { DISCOVERY_FIELDS as FIELDS, ProjectContextSchema } from "@devdocs/shared";
import { PROJECT_TYPE_LABELS } from "@/lib/types";

interface Props { projectType: ProjectType; onSubmit: (ctx: ProjectContext) => void; }

const TYPE_ICONS: Record<ProjectType, string> = { saas:"◈", api:"⟨⟩", internal_tool:"⚙", mobile:"◻", landing_page:"◇", other:"○" };

export function DiscoveryForm({ projectType, onSubmit }: Props) {
  const [values, setValues] = useState<Partial<Record<string,string>>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const submitted = useRef(false);
  const valid = ProjectContextSchema.safeParse({ projectType, ...values }).success;
  function handleSubmit() {
    const parsed = ProjectContextSchema.safeParse({ projectType, ...values });
    if (!parsed.success || submitted.current) return;
    submitted.current = true;
    onSubmit(parsed.data);
  }
  return (
    <div className="flex-1 overflow-y-auto px-6 py-8 max-w-[768px] mx-auto w-full bg-white">
      <div className="mb-1">
        <h2 className="font-serif-heading text-[24px] text-ink mb-1">A few quick questions</h2>
        <p className="text-[14px] text-ink-muted leading-snug">Your answers help tailor the interview to your project. Choose what you know so far.</p>
      </div>
      {/* Project type locked chip — never re-asked */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-sidebar-mist border border-hairline rounded-lg my-4">
        <span className="text-base">{TYPE_ICONS[projectType]}</span>
        <div>
          <div className="text-[13px] text-ink font-medium">{PROJECT_TYPE_LABELS[projectType]}</div>
          <div className="text-[11px] text-ink-faint mt-0.5">Selected when you created the project</div>
        </div>
      </div>
      {FIELDS.map(f => (
        <fieldset key={f.key} className="mb-[18px]" aria-describedby={`setup-${f.key}-hint`} onBlur={e => {
          if (!e.currentTarget.contains(e.relatedTarget)) setTouched(p => ({ ...p, [f.key]: true }));
        }}>
          <legend className="text-[13px] font-medium text-ink mb-2">{f.label}</legend>
          <div className="flex flex-wrap gap-1.5">
            {f.options.map(o => (
              <button key={o.value} type="button" aria-pressed={values[f.key] === o.value} onClick={()=>setValues(p=>({...p,[f.key]:o.value}))} className={cn("px-3.5 py-1.5 rounded-lg border text-[14px] transition-colors",values[f.key]===o.value?"bg-ink text-white border-ink":"bg-white text-ink-secondary border-hairline hover:bg-hover-veil")}>{o.label}</button>
            ))}
          </div>
          <div id={`setup-${f.key}-hint`} className="text-[11px] text-ink-muted mt-1.5" aria-live="polite">
            {"helper" in f && <p>{f.helper}</p>}
            {touched[f.key] && !values[f.key] && <p>Select an answer to continue.</p>}
          </div>
        </fieldset>
      ))}
      <button type="button" disabled={!valid} onClick={handleSubmit} className="w-full py-3 rounded-vellum bg-ink text-vellum text-sm font-medium mt-2.5 disabled:opacity-35 disabled:cursor-not-allowed">Start interview →</button>
    </div>
  );
}
