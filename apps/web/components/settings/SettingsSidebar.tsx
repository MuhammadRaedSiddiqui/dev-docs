// components/settings/SettingsSidebar.tsx
"use client";
import Link from "next/link";
import { cn } from "@/lib/utils";
export type SettingsSection = "account"|"apikey"|"plan"|"privacy";
interface Props { active: SettingsSection; onChange: (s:SettingsSection)=>void; }
const SECTIONS = [{id:"account"as const,label:"Account"},{id:"apikey"as const,label:"AI Providers & Keys"},{id:"plan"as const,label:"Plan & Billing"},{id:"privacy"as const,label:"Privacy & Data"}];
export function SettingsSidebar({active,onChange}:Props) {
  return (
    <aside className="w-full md:w-[260px] max-h-[220px] md:max-h-none flex-shrink-0 border-r border-hairline bg-sidebar-mist flex flex-col py-4 overflow-y-auto">
      <Link href="/dashboard" className="flex items-center gap-1.5 px-4 mb-[18px] text-xs text-ink-muted hover:text-ink">← Back to projects</Link>
      <div className="px-4 mb-2 text-[12px] font-medium uppercase tracking-wider text-ink-secondary">Settings</div>
      <nav className="px-2 grid grid-cols-2 gap-1 md:block">
        {SECTIONS.map(s=>(
          <button key={s.id} type="button" aria-current={active===s.id ? "page" : undefined} onClick={()=>onChange(s.id)} className={cn("w-full min-h-11 md:min-h-10 flex items-center gap-2 px-3 py-2 rounded-lg text-[14px] mb-0.5 transition-colors text-left",active===s.id?"bg-hover-veil text-ink font-medium":"text-ink-muted hover:bg-hover-veil hover:text-ink")}>
            {s.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
