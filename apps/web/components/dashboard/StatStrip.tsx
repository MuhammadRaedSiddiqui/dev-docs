import type { Project } from "@/lib/types";

interface Props { projects: Project[]; userName?: string; }
function getGreeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"; }
function getDate() { return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }

export function StatStrip({ projects, userName }: Props) {
  const total = projects.length;
  const inProgress = projects.filter(project => project.status === "in_progress").length;
  const complete = projects.filter(project => project.status === "complete").length;
  const domains = projects.reduce((sum, project) => sum + project.domainsCompleted, 0);
  const stats = [
    { value: total, label: "Total projects", delta: "in your workspace" },
    { value: inProgress, label: "In progress", delta: "awaiting your input" },
    { value: complete, label: "Complete", delta: "ready to export" },
    { value: domains, label: "Domains documented", delta: "across all projects" },
  ];
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-4">
        <div className="font-serif-heading text-[24px] text-ink">{getGreeting()}{userName ? `, ${userName}` : ""}.</div>
        <div className="text-xs text-ink-faint">{getDate()}</div>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {stats.map(({ value, label, delta }) => (
          <div key={label} className="bg-white border border-hairline rounded-lg p-3.5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-ink" />
            <div className="font-serif-heading text-[24px] text-ink leading-none mb-1">{value}</div>
            <div className="text-[11px] text-ink-muted">{label}</div>
            <div className="text-[10px] mt-1.5 font-medium text-ink-muted">{delta}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
