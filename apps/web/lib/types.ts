// lib/types.ts
export type ProjectType = "saas" | "api" | "internal_tool" | "mobile" | "landing_page" | "other";
export type TeamSize = "solo" | "small" | "medium" | "large";
export type Timeline = "under_1_month" | "1_3_months" | "3_6_months" | "6_plus_months";
export type Budget = "bootstrapped" | "self_funded" | "funded";
export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

export interface ProjectContext {
  projectType: ProjectType;
  teamSize: TeamSize;
  timeline: Timeline;
  budget: Budget;
  experienceLevel: ExperienceLevel;
}

export type DomainId =
  | "planning" | "architecture" | "database" | "api" | "environment"
  | "auth" | "testing" | "monitoring" | "frontend" | "deployment";

export type DomainMode = "cards" | "open";
export type DomainPhase = "not_started" | "interviewing" | "complete";

export interface ChoiceOption {
  id: string;
  label: string;
  description: string;
  isRecommended?: (ctx: ProjectContext) => boolean;
  warningFor?: (ctx: ProjectContext) => string | null;
}

export interface DomainDefinition {
  id: DomainId;
  label: string;
  file: string;
  mode: DomainMode;
  requiredChoiceKey?: string;
  relevantFor: ProjectType[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  showCards?: DomainId;
  isComplete?: boolean;
  showDownload?: boolean;
  domainId?: DomainId;
}

export interface SchemaField { field: string; type: string; note: string; }
export type SchemaTables = Record<string, SchemaField[]>;

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  status: "in_progress" | "complete" | "archived";
  domainsCompleted: number;
  description: string;
  updatedAt: string;
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  saas: "SaaS product", api: "API service", internal_tool: "Internal tool",
  mobile: "Mobile app", landing_page: "Landing page", other: "Other",
};

export const PROJECT_TYPE_BADGE_CLASS: Record<ProjectType, string> = {
  saas: "badge-blue",
  api: "badge-green",
  internal_tool: "badge-amber",
  mobile: "badge-purple",
  landing_page: "badge-orange",
  other: "badge-blue",
};
