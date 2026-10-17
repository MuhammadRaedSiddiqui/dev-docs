import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, ProjectContextSchema } from '@devdocs/shared';
import { readSavedInterviewData } from '../../../web/lib/interview/snapshot';

const context = { projectType: 'saas', teamSize: 'small', timeline: '1_3_months', budget: 'bootstrapped', experienceLevel: 'intermediate' };

describe('discovery compatibility and explicit context', () => {
  it.each(['bootstrapped', 'self_funded', 'funded', 'not_sure'])('round-trips funding %s without transforming its value', budget => {
    const original = { ...context, budget };
    const saved = readSavedInterviewData(JSON.parse(JSON.stringify({ lockedContext: original })))!;
    expect(saved.lockedContext).toEqual(original);
    expect(buildSystemPrompt(saved.lockedContext, 'planning', '', {})).toContain('Project funding:');
  });
  it.each(['under_1_month', '1_3_months', '3_6_months', '6_plus_months', '1_under_3_months', '3_under_6_months', 'not_sure'])('round-trips timeline %s without narrowing old ranges', timeline => {
    const original = { ...context, timeline };
    expect(readSavedInterviewData({ lockedContext: original })!.lockedContext).toEqual(original);
  });
  it.each([
    ['solo', 'Just me'], ['small', '2–3 people'], ['medium', '4–10 people'],
    ['large', '10+ people (original selection)'], ['eleven_plus', '11+ people'],
  ])('keeps %s team size as its selected range', (teamSize, label) => {
    const original = { ...context, teamSize };
    const saved = readSavedInterviewData({ lockedContext: original })!;
    expect(saved.lockedContext).toEqual(original);
    expect(buildSystemPrompt(saved.lockedContext, 'planning', '', {})).toContain(`Development team size: ${label}`);
  });
  it.each([
    ['under_1_month', 'Less than 1 month'], ['1_under_3_months', '1 to under 3 months'],
    ['3_under_6_months', '3 to under 6 months'], ['6_plus_months', '6 months or more'],
  ])('uses the precise %s timeline in prompts', (timeline, label) => {
    expect(buildSystemPrompt(ProjectContextSchema.parse({ ...context, timeline }), 'planning', '', {})).toContain(`Timeline to launch: ${label}`);
  });
  it.each([{ teamSize: '10' }, { timeline: 'unknown' }, { budget: 'unknown' }, { budget: 1000 }])('rejects invalid setup instead of guessing %j', invalid => {
    expect(ProjectContextSchema.safeParse({ ...context, ...invalid }).success).toBe(false);
    expect(readSavedInterviewData({ lockedContext: { ...context, ...invalid } })).toBeNull();
  });
});
