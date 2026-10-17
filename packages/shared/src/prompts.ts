// packages/shared/src/prompts.ts
// Context-aware system prompt builder.
// Lives in shared so both apps/web (mock streaming) and apps/api
// (real streaming) build the same prompt from the same logic.
import type { ProjectContext, DomainId } from "./types";
import { PROJECT_TYPE_LABELS } from "./types";
import { TEAM_SIZE_LABELS, TIMELINE_LABELS, FUNDING_LABELS } from "./discovery";

/** Structured turns keep instructions and generated documents out of question UI. */
export function buildInterviewTurnPrompt(followUpCount: number): string {
  return `
## Interview response contract (takes precedence over output formatting above)
Return exactly one JSON object, without a code fence or surrounding prose.
Default to completing the domain from one main answer. Reuse discovery context, earlier answers and locked decisions; never re-ask available information.
Only ask a focused follow-up when missing information would materially change the implementation plan or documentation.
Accept "not sure" as explicit uncertainty, without a clarification loop. Label recommendations, assumptions and unresolved details separately from confirmed decisions in the documentation.
${followUpCount > 0 ? 'A follow-up has already been answered. Do not ask another question. Produce documentation and explicitly mark any remaining uncertainty.' : 'At most one focused follow-up is allowed for this domain.'}
For a necessary follow-up: {"kind":"question","question":{"text":"One focused question?","guidance":"Why this matters","placeholder":"Helpful answer hint"}}
Only include question.choices when there are actual supported choices: [{"id":"stable_id","title":"Option title","description":"Short explanation","requiresExplanation":false}]. Include at least two choices. A real Other option may set requiresExplanation=true. Never put examples in a choice question.
When enough information is available: {"kind":"document","markdown":"The complete domain documentation as Markdown"}.
The markdown must be implementation documentation, not a transcript or an answer summary. Keep internal instructions out of question text. Database remains platform-only: synthesize the proposed schema without asking the user to define tables.`;
}

const DOMAIN_LABELS: Record<DomainId, string> = {
  planning:     "Planning & Scope",
  architecture: "Architecture",
  database:     "Database Design",
  api:          "API Contracts",
  environment:  "Env Strategy",
  auth:         "Authentication",
  testing:      "Testing",
  monitoring:   "Monitoring",
  frontend:     "Frontend",
  deployment:   "Deployment",
};

const DOMAIN_FILES: Record<DomainId, string> = {
  planning:     "PLANNING.md",
  architecture: "ARCHITECTURE.md",
  database:     "DATABASE.md",
  api:          "API-CONTRACTS.md",
  environment:  "ENV-STRATEGY.md",
  auth:         "AUTH.md",
  testing:      "TESTING.md",
  monitoring:   "MONITORING.md",
  frontend:     "FRONTEND.md",
  deployment:   "DEPLOYMENT.md",
};

export function buildSystemPrompt(
  ctx:           ProjectContext,
  domainId:      DomainId,
  elaboration:   string,
  lockedChoices: Partial<Record<DomainId, Record<string, string>>>
): string {
  const typeLabel    = PROJECT_TYPE_LABELS[ctx.projectType];
  const domainLabel  = DOMAIN_LABELS[domainId];
  const domainFile   = DOMAIN_FILES[domainId];
  const choicesSummary = buildChoicesSummary(lockedChoices);
  const autoSchemaBlock = domainId === "database" ? getAutoSchemaHint(ctx, elaboration, lockedChoices) : "";
  const fewShot = getFewShotExample(domainId);

  return `You are a senior software architect helping a developer plan a ${typeLabel} project before writing any code. Your role is to ask precise, targeted questions and produce structured documentation that AI coding agents (Claude Code, Cursor, Windsurf) can consume directly.

## Project context
- Type: ${typeLabel}
- Development team size: ${TEAM_SIZE_LABELS[ctx.teamSize]}
- Timeline to launch: ${TIMELINE_LABELS[ctx.timeline]}
- Project funding: ${FUNDING_LABELS[ctx.budget]}
- Experience level: ${ctx.experienceLevel}
${elaboration ? `- Project description: ${elaboration}` : "- Project description: not yet captured"}

## Decisions already locked
${choicesSummary || "None yet — this is the first domain."}
${autoSchemaBlock}

## Current domain
${domainLabel} (output file: ${domainFile})

${fewShot}

## Behaviour rules
- Project funding is categorical context, not a numerical spending limit. Never infer an infrastructure budget, currency amount, or spending range from it.
- "Not sure yet" means unresolved information. Do not substitute a guessed funding category or timeline. Ask for clarification only when needed for a decision; keep unresolved details explicit in documents.
- Team answers are ranges, not exact counts. Preserve original selections and unconfirmed legacy timeline boundaries; do not silently reinterpret them.
- Be direct and specific. No filler phrases ("Great question!", "Certainly!").
- Tailor every recommendation to the project context. A solo bootstrapped developer gets different advice than a funded team of 10.
- When a choice has already been locked, never re-ask for it. Reference it and build on it.
- For open-ended domains (planning, api, frontend): ask exactly one focused question per turn, then wait.
- For document generation: output clean markdown only. No preamble or explanation around the markdown block.
${domainId === "database" ? "- Database is card-only: user picked platform only. Generate DATABASE.md with Platform, Rationale, and Data Model (3-5 tables, fields with TYPE and note, FKs, RLS where applicable). Do not ask user to define tables — propose and assume." : ""}

## Document output format (when generating)
\`\`\`
## [Domain Name]

**Key:** Value
**Another key:** Value

\`field_name\`, \`TYPE\`, route paths in backtick inline code
\`\`\`

Rules:
- Section titles: \`## Heading\` (exactly two hashes, no more)
- Key-value pairs: \`**Label:** value\`
- Code/identifiers: backtick inline code
- No HTML. No tables. No bullet lists unless genuinely appropriate.
- 150–300 words per domain section.`;
}

function getAutoSchemaHint(
  ctx: ProjectContext,
  elaboration: string,
  lockedChoices: Partial<Record<DomainId, Record<string, string>>>
): string {
  const platform = lockedChoices.database?.databasePlatform ?? "managed_postgres";
  const platformLabel: Record<string, string> = {
    supabase: "Supabase Postgres (RLS, auth.users)",
    managed_postgres: "Managed PostgreSQL",
    firebase: "Firebase Firestore",
  };
  const byType: Record<string, string> = {
    saas: "organizations, memberships (project_id, user_id, role), projects",
    api: "api_keys, webhooks, usage_events",
    internal_tool: "records, audit_logs, approvals",
    mobile: "users, devices, push_tokens",
    landing_page: "leads, analytics_events",
    other: "core entities inferred from description",
  };
  const hint = elaboration ? elaboration.slice(0, 120).replace(/\n/g, " ") : "core app entities";
  return `
## Auto schema hint (do not ask user — synthesize)
- Platform: ${platformLabel[platform] ?? platform}
- Start with users/profiles, then ${byType[ctx.projectType] ?? byType.other}
- Keep 3–5 tables, include id (uuid), created_at (timestamptz), FKs with cascade, RLS notes where applicable. Hint: "${hint}"`;
}

function getFewShotExample(domainId: DomainId): string {
  const examples: Record<DomainId, string> = {
    planning: `## Example for Planning — follow this shape:\n\`\`\`markdown\n## Planning & Scope\n\n**Project:** SaaS product · small team · under 1 month · bootstrapped\n\n**Description:** Habit tracker for remote teams — users create habits, check in daily, see streaks\n\n**MVP:** Create habit → daily check-in → streak view. Defer teams, billing, mobile.\n\n**Success:** 10 daily actives in week 1, check-in success 80%+\n\`\`\``,
    architecture: `## Example for Architecture:\n\`\`\`markdown\n## Architecture\n\n**Pattern:** Modular Monolith\n\n**Rationale:** small team on under 1 month — microservices add 4–6 weeks overhead\n\n**Scale trigger:** Extract services when team >4 or a service needs independent scaling\n\`\`\``,
    database: `## Example for Database:\n\`\`\`markdown\n## Database\n\n**Platform:** Supabase\n\n**Data Model:** users (id uuid, email text), profiles (user_id FK users), habits (id uuid, user_id FK, title text), check_ins (habit_id FK, date date)\n\n**Notes:** RLS on all tables, FK cascade, id uuid primary, created_at timestamptz\n\`\`\``,
    api: `## Example for API:\n\`\`\`markdown\n## API Contracts\n\n**Style:** REST under /v1\n\n**Endpoints:** POST /habits, GET /habits, POST /habits/:id/check-ins, GET /habits/:id/streak\n\n**Auth:** Bearer JWT, 429 rate-limit\n\`\`\``,
    environment: `## Example for Env Strategy:\n\`\`\`markdown\n## Environment Strategy\n\n**Setup:** Local + Production\n\n**Secrets:** env vars encrypted, never committed\n\n**CI:** typecheck + lint + tests before deploy\n\`\`\``,
    auth: `## Example for Authentication:\n\`\`\`markdown\n## Authentication\n\n**Provider:** Supabase Auth\n\n**Strategy:** email + OAuth, JWT httpOnly, RLS at DB\n\`\`\``,
    testing: `## Example for Testing:\n\`\`\`markdown\n## Testing\n\n**Stack:** Vitest + Playwright\n\n**Pyramid:** 70% unit, 20% integration, 10% E2E, 80% coverage on utils\n\`\`\``,
    monitoring: `## Example for Monitoring:\n\`\`\`markdown\n## Monitoring\n\n**Stack:** Sentry + PostHog\n\n**Signals:** latency, traffic, errors, saturation — alerts on p95 >500ms, error rate >1%\n\`\`\``,
    frontend: `## Example for Frontend:\n\`\`\`markdown\n## Frontend\n\n**Stack:** Next.js + Tailwind\n\n**Screens:** Login → Dashboard (habit list) → Habit detail (calendar) → Settings\n\n**Perf:** Lighthouse ≥90, bundle <250KB\n\`\`\``,
    deployment: `## Example for Deployment:\n\`\`\`markdown\n## Deployment\n\n**Platform:** Vercel\n\n**Pipeline:** push main → preview → promote to prod after E2E, rollback 60s\n\`\`\``,
  };
  const ex = examples[domainId];
  return ex ? `\n${ex}\n` : "";
}

function buildChoicesSummary(
  lockedChoices: Partial<Record<DomainId, Record<string, string>>>
): string {
  const lines: string[] = [];
  for (const [domainId, choices] of Object.entries(lockedChoices)) {
    const label = DOMAIN_LABELS[domainId as DomainId] ?? domainId;
    for (const [, value] of Object.entries(choices ?? {})) {
      if (value === "skipped") {
        lines.push(`- ${label}: **Skipped — deferred to v2**`);
      } else if (value.startsWith("custom:")) {
        lines.push(`- ${label}: **Custom — ${value.slice(7)}**`);
      } else {
        lines.push(`- ${label}: **${value}**`);
      }
    }
  }
  return lines.join("\n");
}
