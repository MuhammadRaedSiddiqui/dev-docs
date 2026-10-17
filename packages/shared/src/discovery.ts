import type { Budget, ExperienceLevel, TeamSize, Timeline } from "./types";

export const TEAM_SIZE_LABELS: Record<TeamSize, string> = {
  solo: "Just me",
  small: "2–3 people",
  medium: "4–10 people",
  large: "10+ people (original selection)",
  eleven_plus: "11+ people",
};

export const TIMELINE_LABELS: Record<Timeline, string> = {
  under_1_month: "Less than 1 month",
  "1_under_3_months": "1 to under 3 months",
  "3_under_6_months": "3 to under 6 months",
  "6_plus_months": "6 months or more",
  "1_3_months": "1–3 months (original selection; boundaries unconfirmed)",
  "3_6_months": "3–6 months (original selection; boundaries unconfirmed)",
  not_sure: "Not sure yet (unresolved)",
};

export const FUNDING_LABELS: Record<Budget, string> = {
  bootstrapped: "Bootstrapped",
  self_funded: "Self-funded",
  funded: "Funded",
  not_sure: "Not sure yet (unresolved)",
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Beginner", intermediate: "Intermediate", experienced: "Experienced",
};

export const DISCOVERY_FIELDS = [
  { key: "teamSize", label: "Development team size", options: [
    { value: "solo", label: TEAM_SIZE_LABELS.solo },
    { value: "small", label: TEAM_SIZE_LABELS.small },
    { value: "medium", label: TEAM_SIZE_LABELS.medium },
    { value: "eleven_plus", label: TEAM_SIZE_LABELS.eleven_plus },
  ] },
  { key: "timeline", label: "Timeline to launch", options: [
    { value: "under_1_month", label: TIMELINE_LABELS.under_1_month },
    { value: "1_under_3_months", label: TIMELINE_LABELS["1_under_3_months"] },
    { value: "3_under_6_months", label: TIMELINE_LABELS["3_under_6_months"] },
    { value: "6_plus_months", label: TIMELINE_LABELS["6_plus_months"] },
    { value: "not_sure", label: "Not sure yet" },
  ] },
  { key: "budget", label: "Project funding", helper: "How the project is funded. This does not set an infrastructure spending limit.", options: [
    { value: "bootstrapped", label: FUNDING_LABELS.bootstrapped },
    { value: "self_funded", label: FUNDING_LABELS.self_funded },
    { value: "funded", label: FUNDING_LABELS.funded },
    { value: "not_sure", label: "Not sure yet" },
  ] },
  { key: "experienceLevel", label: "Your experience", options: [
    { value: "beginner", label: EXPERIENCE_LABELS.beginner },
    { value: "intermediate", label: EXPERIENCE_LABELS.intermediate },
    { value: "experienced", label: EXPERIENCE_LABELS.experienced },
  ] },
] as const;
