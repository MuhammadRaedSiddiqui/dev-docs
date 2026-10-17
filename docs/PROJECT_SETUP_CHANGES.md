# Project creation and setup changes

The existing form layout, typography, components, neutral colors, and dependencies are preserved.

## Implemented behavior

- Creation uses **Create project**, explains the setup step, trims and validates names, retains failed drafts, displays an inline creation error, and guards repeated submissions synchronously.
- Discovery uses **Start interview**, explains how answers tailor the interview, and validates against the shared context schema before starting. Selection buttons expose their pressed state; unanswered groups show an inline hint after focus leaves them.
- The header shows **Project setup** during discovery and restores the real percentage when the interview starts. Creation makes no AI generation request. Existing provider connection and key verification remain in the creation flow.
- **Project funding** keeps `bootstrapped`, `self_funded`, and `funded`. Its helper and prompts describe categorical funding context without inferring infrastructure costs or currency ranges.
- **Development team size** offers Just me, 2–3 people, 4–10 people, and 11+ people. **Your experience** retains Beginner, Intermediate, and Experienced.
- New timeline choices mean less than 1 month, 1 to under 3 months, 3 to under 6 months, and 6 months or more.
- Funding and timeline each offer **Not sure yet**, persisted as `not_sure` and passed to prompts as unresolved information. No guessed replacement is introduced.
- Interview context chips, local openers, document summaries, and shared AI prompts use readable context labels. Recommendations recognize the new 11+ category.

## Persistence and compatibility

The JSON snapshot still uses the `budget` key for funding. No database migration or rewrite of existing answers is required. The shared schema used by snapshot hydration, streaming requests, and the server's saved-context fallback accepts the added values.

New choices use `eleven_plus`, `1_under_3_months`, and `3_under_6_months`. Legacy `large` remains **10+ people (original selection)**; legacy `1_3_months` and `3_6_months` retain their original ranges with boundaries marked unconfirmed. They are never converted to precise counts or narrowed intervals. Unchanged category values remain unchanged.

## Modified files

Application and shared code:

- `apps/web/components/dashboard/CreateProjectModal.tsx`
- `apps/web/components/interview/DiscoveryForm.tsx`
- `apps/web/components/interview/ChatPanel.tsx`
- `apps/web/app/(app)/dashboard/page.tsx`
- `apps/web/app/(app)/project/[id]/interview/page.tsx`
- `apps/web/lib/types.ts`
- `apps/web/lib/interview/domains.ts`
- `apps/web/lib/interview/choices.ts`
- `packages/shared/src/discovery.ts`
- `packages/shared/src/types.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/prompts.ts`
- `packages/shared/src/index.ts`

Verification and existing test consumers:

- `apps/api/src/lib/discovery.unit.test.ts`
- `apps/api/src/routes/hono/ai.unit.test.ts`
- `apps/web/e2e/deterministic/discovery.spec.ts`
- `apps/web/e2e/deterministic/projects.spec.ts`
- `apps/web/e2e/deterministic/onboarding.spec.ts`
- `apps/web/e2e/deterministic/interview.spec.ts`
- `apps/web/e2e/lib/pages/WorkspacePage.ts`
- `apps/web/e2e/lib/pages/DashboardPage.ts`
- `apps/web/e2e/lib/pages/InterviewPage.ts`
- `apps/web/e2e/tests/interview.e2e.spec.ts`
- `apps/web/e2e/tests/full-live.e2e.spec.ts`

Documentation:

- `README.md`
- `CLAUDE.md`
- `docs/PROJECT_SETUP_CHANGES.md`

Unrelated changes already present in the working tree were retained.

## Verification

- `pnpm typecheck`: passed for shared, API, and web after the final source changes.
- `pnpm --filter @devdocs/web lint`: passed without lint warnings or errors.
- `pnpm --filter @devdocs/api test:unit`: 87 tests passed, including provider-prompt checks for uncertainty and legacy saved-context fallback.
- `pnpm --filter @devdocs/api test:unit src/lib/discovery.unit.test.ts`: 24 additional compatibility and schema tests passed.
- `pnpm --filter @devdocs/api build`: passed.
- Broad deterministic browser run for discovery, projects, and onboarding: 43 of 46 passed initially. Two creation-error assertions matched Next.js's route announcer as well as the inline error; the mobile legacy assertion depended on generated chat text. The assertions were corrected and the context chips were updated to shared labels.
- Final focused browser rerun: **6 of 6 passed** across desktop and mobile. It covers all three initial failures plus creation gating, duplicate clicks, inline validation, exact choice labels, uncertainty persistence and reload, request context, legacy hydration, and retained failed drafts.
- Desktop and mobile setup screenshots, plus the updated interview screenshot, were visually inspected; viewport overflow checks passed.
- `git diff --check`: passed.
- `pnpm --filter @devdocs/web build`: passed, including production compilation, lint/type validation, page generation, and build traces.

## Limits

Browser tests use the repository's deterministic API simulator; API unit tests isolate provider/database calls. Live provider requests and PostgreSQL integration tests were not run. Updated live-test selectors were typechecked but the live tests were not executed. The complete 46-case browser suite was not repeated after the final display change; the affected scenarios were rerun on both viewports.

Deploy the web and API with the updated shared schema together so the API accepts the new explicit values. Legacy timeline boundaries remain unconfirmed until the user clarifies them.
