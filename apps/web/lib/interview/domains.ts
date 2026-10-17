// lib/interview/domains.ts
import type { DomainDefinition, DomainId, ProjectContext, ProjectType } from "@/lib/types";
import { PROJECT_TYPE_LABELS } from "@/lib/types";
import { CARD_CHOICES } from "@/lib/interview/choices";
import { TEAM_SIZE_LABELS, TIMELINE_LABELS, FUNDING_LABELS } from "@devdocs/shared";

const ALL_TYPES: ProjectType[] = ["saas", "api", "internal_tool", "mobile", "landing_page", "other"];
const EXCEPT_LANDING: ProjectType[] = ["saas", "api", "internal_tool", "mobile", "other"];

export const DOMAINS: DomainDefinition[] = [
  { id: "planning",     label: "Planning & Scope",  file: "PLANNING.md",       mode: "open",   relevantFor: ALL_TYPES },
  { id: "architecture", label: "Architecture",       file: "ARCHITECTURE.md",   mode: "cards",  requiredChoiceKey: "pattern",            relevantFor: ALL_TYPES },
  { id: "database",     label: "Database",           file: "DATABASE.md",       mode: "cards",  requiredChoiceKey: "databasePlatform",   relevantFor: EXCEPT_LANDING },
  { id: "api",          label: "API Contracts",      file: "API-CONTRACTS.md",  mode: "open",                                            relevantFor: ["saas", "api", "mobile", "other"] },
  { id: "environment",  label: "Env Strategy",       file: "ENV-STRATEGY.md",   mode: "cards",  requiredChoiceKey: "envStrategy",        relevantFor: EXCEPT_LANDING },
  { id: "auth",         label: "Authentication",     file: "AUTH.md",           mode: "cards",  requiredChoiceKey: "authProvider",       relevantFor: EXCEPT_LANDING },
  { id: "testing",      label: "Testing",            file: "TESTING.md",        mode: "cards",  requiredChoiceKey: "testingStrategy",    relevantFor: EXCEPT_LANDING },
  { id: "monitoring",   label: "Monitoring",         file: "MONITORING.md",     mode: "cards",  requiredChoiceKey: "monitoringStack",    relevantFor: EXCEPT_LANDING },
  { id: "frontend",     label: "Frontend",           file: "FRONTEND.md",       mode: "open",                                            relevantFor: ["saas", "mobile", "landing_page", "internal_tool", "other"] },
  { id: "deployment",   label: "Deployment",         file: "DEPLOYMENT.md",     mode: "cards",  requiredChoiceKey: "deploymentPlatform", relevantFor: ALL_TYPES },
];

export function getActiveDomains(projectType: ProjectType): DomainDefinition[] {
  return DOMAINS.filter(d => d.relevantFor.includes(projectType));
}

export function getDomain(id: DomainId): DomainDefinition {
  const d = DOMAINS.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown domain: ${id}`);
  return d;
}

export function nextDomainId(current: DomainId, domains: DomainDefinition[] = DOMAINS): DomainId | null {
  const idx = domains.findIndex((d) => d.id === current);
  return idx >= 0 && idx < domains.length - 1 ? domains[idx + 1].id : null;
}

function fmtTeam(ctx: ProjectContext) { return TEAM_SIZE_LABELS[ctx.teamSize]; }
function fmtTimeline(ctx: ProjectContext) { return TIMELINE_LABELS[ctx.timeline]; }

export function getOpener(domainId: DomainId, ctx: ProjectContext, elaboration: string): string {
  const typeLabel = PROJECT_TYPE_LABELS[ctx.projectType];
  switch (domainId) {
    case "planning":
      return `I've got your setup: ${typeLabel}. Development team: ${fmtTeam(ctx)}. Timeline: ${fmtTimeline(ctx)}. Project funding: ${FUNDING_LABELS[ctx.budget]}.\n\nNow tell me about the project itself — what does it do, who is it for, and what's the core thing a user does in it? The more detail you give me here, the more specific I can be in every domain that follows.\n\nExample: "A habit tracker for remote teams — users create habits, check in daily, and see streaks on a dashboard."`;
    case "architecture": return "Now let's pick your architecture pattern.";
    case "database":     return "Choose where your app's information will live. I'll handle the technical setup details in your documentation.";
    case "api":          return `Database choice saved. List the main actions your app needs — things like 'users sign up', 'users create a project', 'users invite teammates'. I'll convert these into endpoints.\n\nExample: "users sign up, users create board, users invite teammate, users move card"`;
    case "environment":  return "Let's lock in your environment strategy.";
    case "auth":         return "Now authentication. Which provider fits your stack?";
    case "testing":      return "Testing strategy next.";
    case "monitoring":   return "Monitoring setup.";
    case "frontend":     return `Almost done. ${elaboration ? "Given what you described earlier, " : ""}describe your key screens in one sentence each — start with what a new user sees first.\n\nExample: "Login → Dashboard with habit list → Habit detail with calendar → Settings"`;
    case "deployment":   return "Last one. Where are you deploying?";
  }
}

export function generateDoc(
  domainId: DomainId, ctx: ProjectContext,
  choices: Partial<Record<DomainId, Record<string, string>>>, elaboration: string
): string {
  const tl = PROJECT_TYPE_LABELS[ctx.projectType];
  const team = fmtTeam(ctx);
  const timeline = fmtTimeline(ctx);
  const budget = `Project funding: ${FUNDING_LABELS[ctx.budget]}`;
  const choiceLabel = (id: DomainId, key: string) => {
    const cid = choices[id]?.[key];
    return cid ? (CARD_CHOICES[id]?.find((o) => o.id === cid)?.label ?? cid) : null;
  };
  switch (domainId) {
    case "planning":      return `## Planning & Scope\n\n**Project:** ${tl} · Development team: ${team} · Timeline: ${timeline} · ${budget}\n\n**Description:** ${elaboration || "(provided during interview)"}\n\n**MVP:** Core user action that delivers value. Everything else deferred to v2.\n\n**Success:** 10 active users in week 1. Core action succeeds 80%+ of attempts.`;
    case "architecture":  return `## Architecture\n\n**Pattern:** ${choiceLabel("architecture","pattern") ?? "Monolith"}\n\n**Rationale:** Development team: ${team}. Timeline: ${timeline}. Microservices add 4-6 weeks overhead before first feature ships.\n\n**Scale trigger:** Extract services when team > 4 or a component needs independent scaling.`;
    case "database":      return `## Database\n\n**Platform:** ${choiceLabel("database", "databasePlatform") ?? "Managed PostgreSQL"}\n\n**Approach:** Start with a managed service so backups, access control, and growth are handled without extra infrastructure work.\n\n**Data model:** Define the app's records as features are built; keep customer data private and exportable.`;
    case "api":           return `## API Contracts\n\n**Style:** REST\n\n**Convention:** resource-based routes, versioned under \`/v1\`. Auth required on all routes except \`/health\`.\n\n**Pagination:** cursor-based for all list endpoints.`;
    case "environment":   return `## Environment Strategy\n\n**Setup:** ${choiceLabel("environment","envStrategy") ?? "Local + Staging + Production"}.\n\n**Secrets:** encrypted environment variables — never committed to version control.\n\n**CI gates:** type-check, lint, and tests must pass before any staging deploy.`;
    case "auth":          return `## Authentication\n\n**Provider:** ${choiceLabel("auth","authProvider") ?? "Supabase Auth"}\n\n**Strategy:** email + OAuth, JWT in httpOnly cookie. Row Level Security at the database layer.`;
    case "testing":       return `## Testing\n\n**Stack:** ${choiceLabel("testing","testingStrategy") ?? "Vitest + Playwright"}\n\n**Pyramid:** 70% unit, 20% integration, 10% E2E.\n\n**Coverage target:** 80% on utilities and state management.`;
    case "monitoring":    return `## Monitoring\n\n**Stack:** ${choiceLabel("monitoring","monitoringStack") ?? "Sentry + PostHog"}\n\n**Golden signals:** latency, traffic, errors, and saturation — each with a defined alert threshold.`;
    case "frontend":      return `## Frontend\n\n**Stack:** Next.js + shadcn/ui + Tailwind CSS\n\n**Screens:** ${elaboration ? elaboration.split(" ").slice(0,16).join(" ")+"..." : "(defined during interview)"}\n\n**Performance:** Lighthouse ≥ 90 all categories. Bundle size alert at 250KB gzipped.`;
    case "deployment":    return `## Deployment\n\n**Platform:** ${choiceLabel("deployment","deploymentPlatform") ?? "Vercel"}\n\n**Pipeline:** push to main → staging auto-deploy → manual promote to production after E2E pass.\n\n**Rollback:** previous deployment available within 60 seconds.`;
  }
}

export function buildFullDocument(ctx: ProjectContext, docs: Partial<Record<DomainId, string>>): string {
  let out = `# Project Documentation\n*Generated by DevDocs AI · ${PROJECT_TYPE_LABELS[ctx.projectType]} · Development team: ${fmtTeam(ctx)} · Timeline: ${fmtTimeline(ctx)}*\n\n---\n\n`;
  for (const d of getActiveDomains(ctx.projectType)) {
    out += (docs[d.id] ?? `## ${d.label}\n\n_(not generated)_`) + "\n\n---\n\n";
  }
  return out;
}
