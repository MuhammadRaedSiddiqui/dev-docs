// Read-only PostgreSQL diagnostics; generation requires an explicit flag and ledger.
import fs from 'node:fs';
import { createDecipheriv, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import postgres from 'postgres';
import OpenAI from 'openai';

const root = new URL('../../../', import.meta.url);
const env = parse(fs.readFileSync(new URL('apps/api/.env', root)));
const output = process.argv[2];
const model = process.argv[3] ?? 'muse-spark-1.3-contributor';
const generate = process.argv.includes('--generate');
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 });
const result = { at: new Date().toISOString(), generationRequests: 0, readOnlyDatabase: true };
try {
  const fixture = await sql.begin('read only', async tx => {
    const projects = await tx`select id, user_id, status, interview_data from projects where name = 'taskflow' and deleted_at is null order by created_at desc limit 1`;
    const keys = projects.length
      ? await tx`select key_hash from user_api_keys where user_id = ${projects[0].user_id} and provider = 'metamuse'`
      : await tx`select key_hash from user_api_keys where provider = 'metamuse'`;
    if (keys.length !== 1) throw new Error('AmbiguousOrMissingMetaKey');
    const documents = projects.length ? await tx`select domain_id, content from documentation_bundles where project_id = ${projects[0].id} order by domain_id` : [];
    return { encryptedKey: keys[0].key_hash, projectId: projects[0]?.id,
      status: projects[0]?.status, completedDomains: projects[0]?.interview_data?.completedDomains,
      documents: documents.map(d => ({ domainId: d.domain_id, characters: d.content.length,
        sha256: createHash('sha256').update(d.content).digest('hex') })) };
  });
  const encrypted = Buffer.from(fixture.encryptedKey, 'base64');
  if (!/^[a-f\d]{64}$/i.test(env.ENCRYPTION_KEY ?? '')) throw new Error('InvalidEncryptionConfiguration');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(env.ENCRYPTION_KEY, 'hex'), encrypted.subarray(0, 12));
  decipher.setAuthTag(encrypted.subarray(12, 28));
  const key = Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString('utf8');
  result.project = { id: fixture.projectId, status: fixture.status, completedDomains: fixture.completedDomains, documents: fixture.documents };
  result.catalog = [];
  for (const endpoint of generate ? [] : ['/models', '/models/' + encodeURIComponent(model)]) {
    const response = await fetch('https://api.meta.ai/v1' + endpoint, {
      headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    const body = await response.json().catch(() => ({}));
    const ids = (Array.isArray(body.data) ? body.data : body.id ? [body] : [])
      .map(m => m.id).filter(id => typeof id === 'string' && /^[a-zA-Z0-9_.:/-]{1,120}$/.test(id));
    result.catalog.push({ endpoint, status: response.status, modelIds: ids });
  }
  if (generate) {
    if (model !== 'muse-spark-1.3-contributor') throw new Error('UnapprovedDiagnosticModel');
    const ledgerPath = process.env.E2E_SPEND_LEDGER;
    if (!ledgerPath) throw new Error('MissingSpendingLedger');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const payload = { model, messages: [{ role: 'user', content: 'Reply with one short sentence confirming you can respond.' }],
      stream: true, stream_options: { include_usage: true }, reasoning_effort: 'low', max_completion_tokens: 4000 };
    // Keep the prior standard-tier bound, which exceeds Contributor pricing.
    const reservationUsd = 3 * ((Buffer.byteLength(JSON.stringify(payload)) + 20000) * 1.25 / 1000000 + 4000 * 4.25 / 1000000);
    const reserved = ledger.attempts.reduce((sum, attempt) => sum + attempt.reservationUsd, 0);
    if (reserved + reservationUsd > Math.min(8.23, ledger.allowanceUsd)) throw new Error('SpendingCeilingReached');
    ledger.attempts.push({ at: new Date().toISOString(), test: 'Explicit requested model diagnostic',
      model, persistDocument: false, sdkAttemptsReserved: 3, reservationUsd });
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
    result.reservation = { reservationUsd, newWorkReservationsUsd: reserved + reservationUsd,
      cumulativeReservationsUsd: ledger.previousReservationUsd + reserved + reservationUsd,
      exactBilledSpendVerified: false, sdkAttemptsReserved: 3 };
    result.generationRequests = 1;
    if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
    const client = new OpenAI({ apiKey: key, baseURL: 'https://api.meta.ai/v1', maxRetries: 2, timeout: 20000 });
    const stream = await client.chat.completions.create(payload);
    let content = '';
    let finishReason = null;
    let usage = null;
    for await (const chunk of stream) {
      content += chunk.choices[0]?.delta?.content ?? '';
      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;
      if (chunk.usage) usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens,
        reasoningTokens: chunk.usage.completion_tokens_details?.reasoning_tokens };
    }
    result.generation = { model, contentCharacters: content.length, finishReason, usage,
      passed: content.trim().length > 0 && finishReason === 'stop' };
    if (!result.generation.passed) process.exitCode = 1;
  }
} catch (error) {
  result.error = { type: error.name, status: error.status ?? null, code: error.code ?? error.cause?.code ?? null };
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
if (output) fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
