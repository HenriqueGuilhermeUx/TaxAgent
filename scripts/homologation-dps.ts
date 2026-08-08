import { readFile } from 'node:fs/promises';

const api = (process.env.TAXAGENT_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const companyId = required('TAXAGENT_COMPANY_ID');
const apiKey = required('TAXAGENT_API_KEY');
const invoiceFile = required('TAXAGENT_HOMO_INVOICE_FILE');

async function main() {
  const draft = JSON.parse(await readFile(invoiceFile, 'utf8')) as Record<string, unknown>;
  delete draft.company_id;
  delete draft.environment;
  const body = { ...draft, company_id: companyId, environment: 'test' };
  const response = await fetch(`${api}/v1/operations/dps/validate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: any = raw;
  try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(`DPS dry-run failed (${response.status}): ${typeof parsed === 'string' ? parsed.slice(0, 2000) : JSON.stringify(parsed)}`);
  console.log(JSON.stringify(parsed, null, 2));
  if (parsed.transmitted !== false || parsed.valid !== true) throw new Error('Unexpected dry-run response; no transmission was expected');
}
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
