import { readFile } from 'node:fs/promises';

const api = (process.env.TAXAGENT_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const companyId = required('TAXAGENT_COMPANY_ID');
const apiKey = required('TAXAGENT_API_KEY');
const invoiceFile = required('TAXAGENT_HOMO_INVOICE_FILE');
const issuerCityCode = required('TAXAGENT_HOMO_CITY_CODE');
const treatment = required('TAXAGENT_HOMO_TAX_TREATMENT');

async function main() {
  if (!['standard', 'differentiated', 'special', 'unknown'].includes(treatment)) throw new Error('TAXAGENT_HOMO_TAX_TREATMENT must be standard, differentiated, special or unknown');
  const draft = JSON.parse(await readFile(invoiceFile, 'utf8')) as any;
  const service = draft.service ?? {};
  const payload = {
    company_id: companyId,
    effective_at: draft.competence ?? new Date().toISOString().slice(0, 10),
    amount: service.amount,
    issuer_city_code: issuerCityCode,
    destination_city_code: service.service_location_city_code,
    national_service_code: service.national_service_code,
    operation_indicator: service.operation_indicator,
    cst: service.tax_situation,
    tax_classification: service.tax_classification,
    tax_treatment: treatment,
  };
  const response = await fetch(`${api}/v1/tax/resolve`, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const raw = await response.text(); let parsed: any = raw; try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(`Tax decision failed (${response.status}): ${typeof parsed === 'string' ? parsed.slice(0, 2000) : JSON.stringify(parsed)}`);
  console.log(JSON.stringify(parsed, null, 2));
  if (parsed.status !== 'resolved') { console.error('Tax decision is not resolved. Fix missing/official validation inputs before dry-run.'); process.exitCode = 2; return; }
  console.log(`\nSet locally for the next commands:\nTAXAGENT_TAX_DECISION_ID=${parsed.id}`);
}
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
