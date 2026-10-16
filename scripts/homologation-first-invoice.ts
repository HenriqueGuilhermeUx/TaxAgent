import { readFile } from 'node:fs/promises';

const api = (process.env.TAXAGENT_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const companyId = required('TAXAGENT_COMPANY_ID');
const apiKey = required('TAXAGENT_API_KEY');
const invoiceFile = required('TAXAGENT_HOMO_INVOICE_FILE');
const taxDecisionId = required('TAXAGENT_TAX_DECISION_ID');
const invoiceIdempotencyKey = required('TAXAGENT_FIRST_INVOICE_IDEMPOTENCY_KEY');
const preparedIdempotencyKey = (process.env.TAXAGENT_PREPARED_DPS_IDEMPOTENCY_KEY ?? ('prepared-' + invoiceIdempotencyKey)).trim();
const confirmation = required('TAXAGENT_CONFIRM_FIRST_TRANSMISSION');

async function main() {
  if (confirmation !== 'YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS') {
    throw new Error('Refusing transmission. TAXAGENT_CONFIRM_FIRST_TRANSMISSION must equal YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS');
  }

  const issuer = await call('GET', `/v1/operations/issuer-readiness/${encodeURIComponent(companyId)}?environment=test`);
  if (issuer.eligible_for_national_test_issuance !== true) {
    console.error(JSON.stringify(issuer, null, 2));
    throw new Error('Refusing transmission because issuer readiness is not eligible for National Produção Restrita issuance');
  }

  const draft = JSON.parse(await readFile(invoiceFile, 'utf8')) as Record<string, unknown>;
  delete draft.company_id;
  delete draft.environment;
  delete draft.tax_decision_id;
  delete draft.prepared_dps_id;
  const body = { ...draft, company_id: companyId, environment: 'test', tax_decision_id: taxDecisionId };

  const prepared = await call('POST', '/v1/operations/dps/prepare', body, preparedIdempotencyKey);
  if (!prepared?.id || prepared.transmitted !== false) {
    throw new Error('Prepared DPS creation did not return an immutable non-transmitted artifact');
  }

  const signed = await call('POST', `/v1/operations/dps/prepared/${encodeURIComponent(prepared.id)}/sign`);
  if (signed?.signed !== true || signed?.transmitted !== false || !signed?.resume_payload?.prepared_dps_id) {
    throw new Error('Prepared DPS signing did not return signed=true/transmitted=false with resume_payload');
  }
  if (signed.resume_payload.prepared_dps_id !== signed.id) {
    throw new Error('Prepared DPS resume_payload identifier mismatch');
  }

  const readiness = await call('POST', `/v1/operations/readiness/${encodeURIComponent(companyId)}/probe?environment=test`);
  if (readiness.ready_for_transmission !== true) {
    console.error(JSON.stringify(readiness, null, 2));
    throw new Error('Refusing transmission because readiness/probe is not fully green. Keep live gates closed until this is intentionally resolved.');
  }

  const response = await fetch(`${api}/v1/invoices`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': invoiceIdempotencyKey,
    },
    body: JSON.stringify(signed.resume_payload),
  });
  const raw = await response.text();
  let parsed: any = raw;
  try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    throw new Error(`First invoice request failed (${response.status}): ${typeof parsed === 'string' ? parsed.slice(0, 2000) : JSON.stringify(parsed)}`);
  }

  console.log(JSON.stringify({
    ...parsed,
    prepared_dps_id: signed.id,
    dps_id: signed.dps_id,
    signed_xml_sha256: signed.signed_xml_sha256,
    tax_decision_id: taxDecisionId,
    invoice_idempotency_key: invoiceIdempotencyKey,
    prepared_idempotency_key: preparedIdempotencyKey,
    transmission_request_accepted: true,
    authorization_proven: false,
    instruction: `Poll GET /v1/invoices/${parsed.id} using the same API key. Only status=authorized with official access_key + preserved authorized XML proves issuance.`,
  }, null, 2));
}

async function call(method: string, path: string, body?: unknown, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: 'application/json',
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const response = await fetch(`${api}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: any = raw;
  try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) {
    throw new Error(`TaxAgent ${response.status} ${path}: ${typeof parsed === 'string' ? parsed.slice(0, 1000) : JSON.stringify(parsed)}`);
  }
  return parsed;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
