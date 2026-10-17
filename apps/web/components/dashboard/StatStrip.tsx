"use client";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";
import s from "./dashboard.module.css";

interface Props { projects: Project[]; userName?: string; }
function getGreeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function getDate() { return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }

export function StatStrip({ projects, userName }: Props) {
  const [localTime, setLocalTime] = useState<{ greeting: string; date: string } | null>(null);
  // Cached server HTML and the browser can have different dates/timezones.
  useEffect(() => { setLocalTime({ greeting: getGreeting(), date: getDate() }); }, []);
  const total = projects.length;
  const inProgress = projects.filter(project => project.status === "in_progress").length;
  const complete = projects.filter(project => project.status === "complete").length;
  const domains = projects.reduce((sum, project) => sum + project.domainsCompleted, 0);
  const stats = [
    { value: total, label: "Total projects" },
    { value: inProgress, label: "In progress" },
    { value: complete, label: "Complete" },
    { value: domains, label: "Interview domains completed" },
  ];
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <div className="font-serif-heading text-[24px] text-ink">{localTime?.greeting ?? "Welcome"}{userName ? `, ${userName}` : ""}.</div>
        <div className="text-[14px] text-ink-muted">{localTime?.date}</div>
      </div>
      <dl className={s.statGrid} aria-label="Project statistics">
        {stats.map(({ value, label }) => (
          <div key={label} className={s.statCard}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
