// packages/shared/src/schemas.ts
// Zod schemas for every API request/response shape.
// Used for runtime validation in apps/api routes AND
// for TypeScript types in apps/web fetch helpers — no duplication.
import { z } from "zod";

export const DomainIdSchema = z.enum([
  "planning", "architecture", "database", "api", "environment",
  "auth", "testing", "monitoring", "frontend", "deployment",
]);

export const ProjectContextSchema = z.object({
  projectType: z.enum(["saas", "api", "internal_tool", "mobile", "landing_page", "other"]),
  teamSize: z.enum(["solo", "small", "medium", "large", "eleven_plus"]),
  timeline: z.enum(["under_1_month", "1_3_months", "3_6_months", "6_plus_months", "1_under_3_months", "3_under_6_months", "not_sure"]),
  budget: z.enum(["bootstrapped", "self_funded", "funded", "not_sure"]),
  experienceLevel: z.enum(["beginner", "intermediate", "experienced"]),
});

// ── AI streaming ──────────────────────────────────────────────────────────────
export const MAX_HISTORY_MESSAGE_CHARS = 4000;
export const InterviewQuestionSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  guidance: z.string().max(2000).optional(),
  placeholder: z.string().max(500).optional(),
  example: z.string().max(2000).optional(),
  choices: z.array(z.object({
    id: z.string().min(1).max(100), title: z.string().min(1).max(200),
    description: z.string().max(500).optional(), requiresExplanation: z.boolean().optional(),
  })).min(2).max(12).optional(),
});
export const InterviewTurnSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('question'), question: InterviewQuestionSchema }),
  z.object({ kind: z.literal('document'), markdown: z.string().trim().min(1).max(100000) }),
]);
export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;
export type InterviewTurn = z.infer<typeof InterviewTurnSchema>;
export const InterviewWorkflowSchema = z.object({
  currentDomain: DomainIdSchema,
  question: InterviewQuestionSchema,
  followUpCount: z.number().int().min(0).max(1).default(0),
  draft: z.object({ text: z.string(), choice: z.string(), context: z.string() }),
  pending: z.object({
    domainId: DomainIdSchema, userMessage: z.string(),
    mode: z.enum(['interview', 'document']),
    generatedDocument: z.string().optional(), regenerate: z.boolean().optional(),
    previousContent: z.string().optional(),
  }).nullable(),
});
export type InterviewWorkflow = z.infer<typeof InterviewWorkflowSchema>;
export const StreamRequestSchema = z.object({
  projectId:   z.string().uuid("projectId must be a valid UUID"),
  domainId:    DomainIdSchema,
  userMessage: z.string().min(1, "Message cannot be empty").max(4000, "Message too long"),
  provider:    z.enum(["anthropic", "openai", "bedrock", "metamuse"]).default("anthropic"),
  // Chat openers, help and closing messages must never replace a document.
  persistDocument: z.boolean().default(false),
  responseMode: z.enum(['legacy', 'interview']).default('legacy'),
  followUpCount: z.number().int().min(0).max(1).default(0),
  // `interview` is required for new clients; optional for backward-compat with
  // older deployed web builds that still rely on server-side interview_data.
  interview: z.object({
    lockedContext: ProjectContextSchema,
    lockedChoices: z.record(z.record(z.string())).default({}),
    elaboration: z.string().max(4000).default(""),
    confirmedAnswers: z.array(z.object({ domainId: DomainIdSchema, answer: z.string().max(4000) })).max(30).optional(),
  }).optional(),
  // Recent conversation history for multi-turn open domains (optional, max 12)
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(MAX_HISTORY_MESSAGE_CHARS),
  })).max(12).optional(),
});

export type StreamRequest = z.infer<typeof StreamRequestSchema>;

// SSE event shapes sent from the server to the browser
export const StreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text:      z.string() }),
  z.object({ type: z.literal('status'), status: z.enum(['generating', 'saving']) }),
  z.object({ type: z.literal("done"), text: z.string(), result: InterviewTurnSchema.optional() }),
  z.object({ type: z.literal("error"), errorType: z.string(), message: z.string(), generatedDocument: z.string().optional() }),
]);

export type StreamEvent = z.infer<typeof StreamEventSchema>;

// ── Projects ──────────────────────────────────────────────────────────────────
export const ProjectCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  type: z.enum(["saas", "api", "internal_tool", "mobile", "landing_page", "other"]),
});

export const ProjectUpdateSchema = z.object({
  name:          z.string().min(1).max(100).optional(),
  status:        z.enum(["in_progress", "complete", "archived"]).optional(),
  interviewData: z.record(z.unknown()).optional(),
}).refine(data => Object.keys(data).length > 0, { message: "At least one field required" });

export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;

// ── API keys ──────────────────────────────────────────────────────────────────
export const ApiKeyUpsertSchema = z.object({
  provider: z.enum(["anthropic", "openai", "metamuse"]),
  key:      z.string().min(10, "Key too short"),
});

export type ApiKeyUpsert = z.infer<typeof ApiKeyUpsertSchema>;

export const ApiKeyResponseSchema = z.object({
  provider:   z.enum(["anthropic", "openai", "metamuse"]),
  maskedKey:  z.string(),
  createdAt:  z.string(),
});

export type ApiKeyResponse = z.infer<typeof ApiKeyResponseSchema>;

// ── Auth ──────────────────────────────────────────────────────────────────────
export const SignInSchema = z.object({
  email:    z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const SignUpSchema = SignInSchema.extend({
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path:    ["confirmPassword"],
});

export type SignIn = z.infer<typeof SignInSchema>;
export type SignUp = z.infer<typeof SignUpSchema>;
