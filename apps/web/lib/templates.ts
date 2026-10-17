import type { DomainId, ProjectContext, ProjectType } from "@/lib/types";

export interface Template {
  id: string;
  name: string;
  description: string;
  projectType: ProjectType;
  lockedContext: ProjectContext;
  lockedChoices: Partial<Record<DomainId, Record<string, string>>>;
  elaboration: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "nextjs-saas",
    name: "Next.js SaaS Starter",
    description: "Plan a solo SaaS project with modular architecture and authentication defaults.",
    projectType: "saas",
    lockedContext: { projectType: "saas", teamSize: "solo", timeline: "3_6_months", budget: "self_funded", experienceLevel: "intermediate" },
    lockedChoices: { architecture: { pattern: "modular" }, auth: { authProvider: "supabase" }, deployment: { deploymentPlatform: "vercel" } },
    elaboration: "",
  },
  {
    id: "rest-api",
    name: "REST API Service",
    description: "Plan an API service with a monolith architecture and Railway deployment choice.",
    projectType: "api",
    lockedContext: { projectType: "api", teamSize: "small", timeline: "1_3_months", budget: "bootstrapped", experienceLevel: "intermediate" },
    lockedChoices: { architecture: { pattern: "monolith" }, deployment: { deploymentPlatform: "railway" } },
    elaboration: "",
  },
  {
    id: "internal-tool",
    name: "Internal Tool",
    description: "Plan an internal tool with authentication and deployment choices for your team.",
    projectType: "internal_tool",
    lockedContext: { projectType: "internal_tool", teamSize: "medium", timeline: "under_1_month", budget: "bootstrapped", experienceLevel: "intermediate" },
    lockedChoices: { auth: { authProvider: "nextauth" }, deployment: { deploymentPlatform: "vercel" } },
    elaboration: "",
  },
  {
    id: "mobile-rn",
    name: "Mobile App (React Native)",
    description: "Plan a mobile app for a small team with authentication and deployment defaults.",
    projectType: "mobile",
    lockedContext: { projectType: "mobile", teamSize: "small", timeline: "3_6_months", budget: "self_funded", experienceLevel: "intermediate" },
    lockedChoices: { auth: { authProvider: "supabase" }, deployment: { deploymentPlatform: "vercel" } },
    elaboration: "",
  },
  {
    id: "landing-page",
    name: "Marketing Landing Page",
    description: "Plan a landing page for a solo developer with a Vercel deployment choice.",
    projectType: "landing_page",
    lockedContext: { projectType: "landing_page", teamSize: "solo", timeline: "under_1_month", budget: "bootstrapped", experienceLevel: "intermediate" },
    lockedChoices: { deployment: { deploymentPlatform: "vercel" } },
    elaboration: "",
  },
  {
    id: "team-dashboard",
    name: "Team Dashboard SaaS",
    description: "Plan a SaaS project for a funded team with authentication, monitoring, and deployment defaults.",
    projectType: "saas",
    lockedContext: { projectType: "saas", teamSize: "large", timeline: "6_plus_months", budget: "funded", experienceLevel: "experienced" },
    lockedChoices: { architecture: { pattern: "modular" }, auth: { authProvider: "auth0" }, monitoring: { monitoringStack: "datadog" }, deployment: { deploymentPlatform: "aws" } },
    elaboration: "",
  },
];
