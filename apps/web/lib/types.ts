// lib/types.ts
import type { ProjectContext, ProjectType } from "@devdocs/shared";
export type { ProjectType, TeamSize, Timeline, Budget, ExperienceLevel, ProjectContext } from "@devdocs/shared";

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
