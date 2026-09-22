// packages/shared/src/types.ts
// Single source of truth for all types shared between apps/web and apps/api.
// Import from "@devdocs/shared" in both apps — never duplicate these.

export type ProjectType =
  | "saas"
  | "api"
  | "internal_tool"
  | "mobile"
  | "landing_page"
  | "other";

export type TeamSize       = "solo" | "small" | "medium" | "large";
export type Timeline       = "under_1_month" | "1_3_months" | "3_6_months" | "6_plus_months";
export type Budget         = "bootstrapped" | "self_funded" | "funded";
export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

export interface ProjectContext {
  projectType:     ProjectType;
  teamSize:        TeamSize;
  timeline:        Timeline;
  budget:          Budget;
  experienceLevel: ExperienceLevel;
}

export type DomainId =
  | "planning"
  | "architecture"
  | "database"
  | "api"
  | "environment"
  | "auth"
  | "testing"
  | "monitoring"
  | "frontend"
  | "deployment";

export interface ChatMessage {
  role:         "user" | "assistant";
  content:      string;
  showCards?:   DomainId;
  isComplete?:  boolean;
  showDownload?: boolean;
  domainId?:    DomainId;
}

export interface SchemaField {
  field: string;
  type:  string;
  note:  string;
}

export type SchemaTables = Record<string, SchemaField[]>;

export interface Project {
  id:               string;
  name:             string;
  type:             ProjectType;
  status:           "in_progress" | "complete" | "archived";
  domainsCompleted: number;
  description:      string;
  updatedAt:        string;
}

export interface InterviewData {
  lockedContext:       ProjectContext | null;
  lockedChoices:       Partial<Record<DomainId, Record<string, string>>>;
  completedDomains:    DomainId[];
  /** @deprecated Document bodies are stored in documentation_bundles. */
  domainContent?:      Partial<Record<DomainId, string>>;
  conversationHistory: ChatMessage[];
  elaboration:         string;
  // Deprecated — retained for backward compat reads, not written by new clients.
  schemaTables?:       SchemaTables;
  schemaConfirmed?:    boolean;
}

// ── AI provider types (shared between web settings UI and API key vault) ──────
export type AIProvider = "anthropic" | "openai" | "bedrock" | "metamuse";

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey:   string;
  model:    string;
}

export const PROVIDER_MODELS: Record<AIProvider, { default: string; label: string }> = {
  anthropic: { default: "claude-sonnet-4-6",                        label: "Claude Sonnet 4.6" },
  openai:    { default: "gpt-4o",                                    label: "GPT-4o" },
  bedrock:   { default: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", label: "Claude via Bedrock" },
  metamuse:  { default: "muse-spark-1.1",                            label: "Muse Spark 1.1" },
};

export const BEDROCK_MODELS: { id: string; label: string }[] = [
  { id: "anthropic.claude-sonnet-4-5-20251001-v1:0", label: "Claude Sonnet 4.5" },
  { id: "anthropic.claude-haiku-4-5-20251001-v1:0",  label: "Claude Haiku 4.5" },
  { id: "anthropic.claude-3-5-sonnet-20241022-v2:0", label: "Claude 3.5 Sonnet" },
  { id: "anthropic.claude-3-5-haiku-20241022-v1:0",  label: "Claude 3.5 Haiku" },
];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  saas:          "SaaS product",
  api:           "API service",
  internal_tool: "Internal tool",
  mobile:        "Mobile app",
  landing_page:  "Landing page",
  other:         "Other",
};
