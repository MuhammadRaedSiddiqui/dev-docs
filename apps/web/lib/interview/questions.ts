import type { DomainId } from '@/lib/types';
import type { InterviewQuestion } from '@devdocs/shared';
import { CARD_CHOICES } from './choices';

export const DOMAIN_COPY: Record<DomainId, { heading: string; introduction: string; question: string; placeholder?: string; example?: string }> = {
  planning: { heading: 'Start with the big picture.', introduction: 'Define the core experience your project will deliver.', question: 'What are you building, who is it for, and what should they be able to do?', placeholder: 'Describe the problem, the people, and the core action…', example: 'A habit tracker for remote teams. People create habits, check in daily, and see their progress together.' },
  architecture: { heading: 'Give your project a structure.', introduction: 'Choose how the main parts of your application fit together.', question: 'Which architecture fits your project?' },
  database: { heading: 'Find a home for your data.', introduction: 'Choose a platform; we’ll propose the data model from your project scope.', question: 'Where should your application store its data?' },
  api: { heading: 'Connect the core actions.', introduction: 'Turn your project’s workflows into clear API contracts.', question: 'Beyond the workflows already described, which actions or integrations should your API support?', placeholder: 'Add any actions, integrations, or constraints—or say the existing scope covers it.', example: 'Members invite teammates. Administrators export reports. Payments arrive through a webhook.' },
  environment: { heading: 'Make room to build safely.', introduction: 'Decide where development, testing, and production happen.', question: 'Which environment setup fits your team?' },
  auth: { heading: 'Decide how people sign in.', introduction: 'Set a foundation for identity and access.', question: 'Which authentication provider fits your application?' },
  testing: { heading: 'Build confidence in every change.', introduction: 'Choose the testing approach you want to maintain.', question: 'Which testing strategy fits your project?' },
  monitoring: { heading: 'Know how your project is doing.', introduction: 'Choose how you’ll observe errors and product health.', question: 'Which monitoring setup would you like?' },
  frontend: { heading: 'Shape the user experience.', introduction: 'Connect the confirmed workflows to the screens people will use.', question: 'Are there key screens or interface requirements beyond the workflows you’ve already described?', placeholder: 'Describe additional screens, navigation, or accessibility needs—or keep the existing scope.', example: 'A dashboard with recent activity, a project detail view, and settings. The main workflow should work on mobile.' },
  deployment: { heading: 'Get ready to launch.', introduction: 'Choose where your application will run.', question: 'Where would you like to deploy your project?' },
};

/** These are the engine’s existing supported choices, not prototype samples. */
export function mainQuestion(domain: DomainId): InterviewQuestion {
  const copy = DOMAIN_COPY[domain];
  const choices = CARD_CHOICES[domain];
  return {
    text: copy.question, placeholder: copy.placeholder,
    guidance: 'Use what you know today. “Not sure” is a valid answer.',
    ...(choices ? { choices: [
      ...choices.map(option => ({ id: option.id, title: option.label, description: option.description })),
      { id: 'other', title: 'Other', description: 'Use a different approach.', requiresExplanation: true },
      { id: 'not_sure', title: 'Not sure yet', description: 'Document a recommendation as an assumption.' },
      { id: 'skipped', title: 'Defer for now', description: 'Record this domain as deferred to a later version.' },
    ] } : { example: copy.example }),
  };
}
