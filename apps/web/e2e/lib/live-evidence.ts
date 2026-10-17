import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { TestInfo } from '@playwright/test';

export interface LiveEvidence {
  project: { id: string; name: string; type: string; status: string; interview_data: {
    completedDomains: string[]; lockedChoices: Record<string, Record<string, string>>;
    conversationHistory: { role: string; content: string; domainId?: string; showCards?: string }[];
  } };
  documents: { domain_id: string; content: string }[];
  sessions: { id: string; total_domains_completed: number; is_complete: boolean; primary_provider: string | null }[];
  messageCounts: unknown[];
}

export function readLiveEvidence(projectId: string): LiveEvidence {
  return JSON.parse(execFileSync(process.execPath, [path.resolve('../api/scripts/live-project-evidence.mjs'), projectId],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true }));
}

export async function captureLiveEvidence(projectId: string, name: string, info: TestInfo) {
  const evidence = readLiveEvidence(projectId);
  const file = info.outputPath(`${name}.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  await info.attach(name, { path: file, contentType: 'application/json' });
  return evidence;
}
