import { readFile } from 'node:fs/promises';

const api = (process.env.TAXAGENT_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const companyId = required('TAXAGENT_COMPANY_ID');
const apiKey = required('TAXAGENT_API_KEY');
const invoiceFile = required('TAXAGENT_HOMO_INVOICE_FILE');
const idempotencyKey = required('TAXAGENT_FIRST_INVOICE_IDEMPOTENCY_KEY');
const confirmation = required('TAXAGENT_CONFIRM_FIRST_TRANSMISSION');

async function main() {
  if (confirmation !== 'YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS') {
    throw new Error('Refusing transmission. TAXAGENT_CONFIRM_FIRST_TRANSMISSION must equal YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS');
  }
  const readiness = await call('POST', `/v1/operations/readiness/${encodeURIComponent(companyId)}/probe?environment=test`);
  if (readiness.ready_for_transmission !== true) {
    console.error(JSON.stringify(readiness, null, 2));
    throw new Error('Refusing transmission because readiness/probe is not fully green');
  }
  const draft = JSON.parse(await readFile(invoiceFile, 'utf8')) as Record<string, unknown>;
  delete draft.company_id;
  delete draft.environment;
  const body = { ...draft, company_id: companyId, environment: 'test' };
  const response = await fetch(`${api}/v1/invoices`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: any = raw;
  try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(`First invoice request failed (${response.status}): ${typeof parsed === 'string' ? parsed.slice(0, 2000) : JSON.stringify(parsed)}`);
  console.log(JSON.stringify({ ...parsed, idempotency_key: idempotencyKey, instruction: `Poll GET /v1/invoices/${parsed.id} using the same API key and inspect the fiscal ledger/documents.` }, null, 2));
}
async function call(method: string, path: string) {
  const response = await fetch(`${api}${path}`, { method, headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' } });
  const raw = await response.text(); let body: any = raw; try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(`TaxAgent ${response.status} ${path}: ${typeof body === 'string' ? body.slice(0, 1000) : JSON.stringify(body)}`);
  return body;
}
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
