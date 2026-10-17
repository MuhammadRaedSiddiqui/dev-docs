import fs from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import { META_MUSE_MAX_COMPLETION_TOKENS } from '@devdocs/shared';

/** Persist reservations BEFORE forwarding traffic, including all three SDK attempts. */
export async function guardLiveBudget(page: Page, info: TestInfo, limitUsd: number, maxRequests = 5) {
  const ledgerPath = process.env.E2E_SPEND_LEDGER;
  if (maxRequests > 5 && !ledgerPath) throw new Error('Full interviews require E2E_SPEND_LEDGER');
  const ledger = ledgerPath && fs.existsSync(ledgerPath)
    ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
    : { previousReservationUsd: 1.76834625, allowanceUsd: limitUsd, attempts: [] };
  if (ledger.allowanceUsd !== limitUsd || !(limitUsd > 0 && limitUsd <= 8.23)) {
    throw new Error('Live allowance must match the cumulative ledger and remain within $8.23');
  }
  let requests = 0;
  const snapshot = () => {
    const newReservationUsd = ledger.attempts.reduce((sum: number, attempt: { reservationUsd: number }) => sum + attempt.reservationUsd, 0);
    return { requests, maxRequests, newReservationUsd, previousReservationUsd: ledger.previousReservationUsd,
      cumulativeReservationUsd: ledger.previousReservationUsd + newReservationUsd,
      remainingAllowanceUsd: limitUsd - newReservationUsd, exactBilling: 'unverified' };
  };
  await page.route('**/ai/stream', async route => {
    const request = route.request();
    const body = request.postDataJSON();
    if (body.provider !== 'metamuse') {
      await route.abort('blockedbyclient');
      throw new Error('The live budget guard supports only Meta Muse');
    }
    // Payload bytes bound variable prompt/history tokens; 20k covers fixed system
    // instructions and framing. Reserve full reasoning + visible output budget.
    const bytes = Buffer.byteLength(request.postData() ?? '', 'utf8');
    const reservationUsd = 3 * ((bytes + 20_000) * 1.25 / 1_000_000 + META_MUSE_MAX_COMPLETION_TOKENS * 4.25 / 1_000_000);
    if (requests >= maxRequests || snapshot().newReservationUsd + reservationUsd > limitUsd) {
      await route.abort('blockedbyclient');
      throw new Error('Cumulative live interview generation budget reached');
    }
    requests++;
    ledger.attempts.push({ at: new Date().toISOString(), test: info.title, projectId: body.projectId,
      domainId: body.domainId, persistDocument: body.persistDocument, payloadBytes: bytes, sdkAttemptsReserved: 3, reservationUsd });
    if (ledgerPath) {
      fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
      fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    }
    await info.attach(`provider-budget-${requests}`, { body: JSON.stringify(snapshot()), contentType: 'application/json' });
    await route.continue();
  });
  return snapshot;
}
