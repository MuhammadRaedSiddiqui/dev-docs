// lib/interview/choices.ts
import type { ChoiceOption, DomainId, ProjectContext } from "@/lib/types";

const isLargeTeam = (c: ProjectContext) => c.teamSize === "large" || c.teamSize === "eleven_plus";

export const CARD_CHOICES: Partial<Record<DomainId, ChoiceOption[]>> = {
  architecture: [
    { id: "monolith",      label: "Monolith",          description: "Single codebase, one deployment.", isRecommended: (c) => c.teamSize === "solo" || c.timeline === "under_1_month" },
    { id: "modular",       label: "Modular Monolith",  description: "Monolith with enforced module boundaries.", isRecommended: (c) => c.teamSize === "small" || c.teamSize === "medium" },
    { id: "microservices", label: "Microservices",     description: "Independent deployable services.", warningFor: (c) => c.teamSize === "solo" || c.experienceLevel === "beginner" ? "Adds 4–6 weeks of infrastructure work before your first feature ships" : null },
  ],
  database: [
    { id: "supabase", label: "Supabase", description: "Managed data, sign-in, and storage in one service.", isRecommended: (c) => c.teamSize === "solo" || c.experienceLevel === "beginner" },
    { id: "managed_postgres", label: "Managed PostgreSQL", description: "A flexible, reliable database for most web applications.", isRecommended: (c) => c.experienceLevel !== "beginner" },
    { id: "firebase", label: "Firebase", description: "Google-managed data with real-time updates built in.", isRecommended: (c) => c.projectType === "mobile" },
  ],
  environment: [
    { id: "three_envs",   label: "Local + Staging + Prod",  description: "Standard three-environment setup.",          isRecommended: (c) => c.teamSize !== "solo" },
    { id: "two_envs",     label: "Local + Production",       description: "Minimal overhead — good for solo devs.",     isRecommended: (c) => c.teamSize === "solo" },
    { id: "feature_envs", label: "Per-PR environments",      description: "Ephemeral environments for every branch.",   isRecommended: isLargeTeam },
  ],
  auth: [
    { id: "supabase",  label: "Supabase Auth", description: "Built into your stack. Auth + RLS together.",    isRecommended: () => true },
    { id: "clerk",     label: "Clerk",         description: "Managed auth with prebuilt UI components.",     isRecommended: (c) => c.experienceLevel === "beginner" },
    { id: "nextauth",  label: "NextAuth",      description: "Flexible, many OAuth providers, self-hosted." },
    { id: "auth0",     label: "Auth0",         description: "Enterprise-grade managed auth.",                isRecommended: (c) => c.budget === "funded" && isLargeTeam(c) },
  ],
  testing: [
    { id: "vitest_playwright", label: "Vitest + Playwright", description: "Modern standard for Next.js projects.", isRecommended: () => true },
    { id: "jest_cypress",      label: "Jest + Cypress",       description: "Widely familiar alternative." },
    { id: "vitest_only",       label: "Vitest only",          description: "Unit tests only, no E2E.",             isRecommended: (c) => c.teamSize === "solo" && c.budget === "bootstrapped" },
  ],
  monitoring: [
    { id: "sentry_posthog", label: "Sentry + PostHog", description: "Error tracking and product analytics.",  isRecommended: () => true },
    { id: "sentry_only",    label: "Sentry only",      description: "Error tracking only, no analytics.",    isRecommended: (c) => c.budget === "bootstrapped" && c.teamSize === "solo" },
    { id: "datadog",        label: "Datadog",          description: "Full observability platform.",           isRecommended: (c) => c.budget === "funded" },
  ],
  deployment: [
    { id: "vercel",       label: "Vercel",       description: "Zero-config Next.js deployment.", isRecommended: () => true },
    { id: "railway",      label: "Railway",      description: "Simple full-stack hosting." },
    { id: "aws",          label: "AWS",          description: "Full control, complex setup.",   isRecommended: (c) => c.budget === "funded" && isLargeTeam(c) },
  ],
};

export interface Recommendation { recommended: boolean; warning: string | null; }

export function getRecommendation(domain: DomainId, choiceId: string, ctx: ProjectContext): Recommendation {
  const option = CARD_CHOICES[domain]?.find((o) => o.id === choiceId);
  if (!option) return { recommended: false, warning: null };
  return {
    recommended: option.isRecommended ? option.isRecommended(ctx) : false,
    warning: option.warningFor ? option.warningFor(ctx) : null,
  };
}

export function getDefaultChoice(domain: DomainId, ctx: ProjectContext): string | null {
  const options = CARD_CHOICES[domain];
  if (!options) return null;
  return options.find((o) => o.isRecommended?.(ctx))?.id ?? options[0]?.id ?? null;
}

export function getAutoChoice(domain: DomainId, ctx: ProjectContext): string | null {
  // Auto-pick for solo to cut interview 8→5 domains; only when choice is obvious
  if (ctx.teamSize !== "solo") return null;
  if (domain === "environment") return "two_envs";
  if (domain === "testing" && ctx.budget === "bootstrapped") return "vitest_only";
  if (domain === "monitoring" && ctx.budget === "bootstrapped") return "sentry_only";
  return null;
}
