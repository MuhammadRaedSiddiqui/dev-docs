import { DISCOVERY_FIELDS, TEAM_SIZE_LABELS, TIMELINE_LABELS, FUNDING_LABELS, EXPERIENCE_LABELS } from "@devdocs/shared";
import { CARD_CHOICES } from "@/lib/interview/choices";
import { DOMAINS } from "@/lib/interview/domains";
import { PROJECT_TYPE_LABELS, type DomainId, type ProjectContext } from "@/lib/types";
import type { Template } from "@/lib/templates";

const CONTEXT_LABELS = {
  teamSize: TEAM_SIZE_LABELS,
  timeline: TIMELINE_LABELS,
  budget: FUNDING_LABELS,
  experienceLevel: EXPERIENCE_LABELS,
};

export function discoveryDefaults(context: ProjectContext) {
  return DISCOVERY_FIELDS.filter(field => context[field.key] !== undefined).map(field => {
    const value = context[field.key];
    const labels = CONTEXT_LABELS[field.key] as Record<string, string>;
    // Keep legacy selections available without silently changing the template.
    const options: { value: string; label: string }[] = [...field.options];
    if (!options.some(option => option.value === value)) options.unshift({ value, label: labels[value] ?? value });
    return { key: field.key, label: field.label, value, displayValue: labels[value] ?? value, options };
  });
}

const CHOICE_LABELS: Record<string, string> = {
  pattern: "Architecture pattern", authProvider: "Authentication provider",
  deploymentPlatform: "Deployment platform", monitoringStack: "Monitoring stack",
  databasePlatform: "Database platform", envStrategy: "Environment strategy", testingStrategy: "Testing strategy",
};

export function interviewDefaults(choices: Template["lockedChoices"]) {
  return Object.entries(choices).flatMap(([domain, fields]) => {
    const definition = DOMAINS.find(item => item.id === domain);
    return Object.entries(fields).map(([key, value]) => {
      const options = CARD_CHOICES[domain as DomainId] ?? [];
      return {
        domain: domain as DomainId, domainLabel: definition?.label ?? domain, key,
        label: CHOICE_LABELS[key] ?? key,
        value, displayValue: options.find(option => option.id === value)?.label ?? value,
        options,
      };
    });
  });
}

export function templateMetadata(template: Template) {
  const defaults = interviewDefaults(template.lockedChoices);
  const domains = [...new Set(defaults.map(choice => choice.domainLabel.toLowerCase()))];
  const stack = defaults.filter(choice => choice.domain !== "architecture").map(choice => choice.displayValue);
  const audience = template.lockedContext.teamSize ? TEAM_SIZE_LABELS[template.lockedContext.teamSize] : null;
  return [
    { label: "Best for", value: [PROJECT_TYPE_LABELS[template.projectType], audience].filter(Boolean).join(" · ") },
    ...(domains.length ? [{ label: "Includes", value: `Prefilled ${domains.join(", ")} choices` }] : []),
    ...(stack.length ? [{ label: "Default stack", value: stack.join(" · ") }] : []),
  ];
}
