const api = (process.env.TAXAGENT_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const companyId = required('TAXAGENT_COMPANY_ID');
const apiKey = required('TAXAGENT_API_KEY');

async function main() {
  const report = await call('GET', `/v1/operations/readiness/${encodeURIComponent(companyId)}?environment=test`);
  console.log('--- LOCAL READINESS ---');
  console.log(JSON.stringify(report, null, 2));

  const probe = await call('POST', `/v1/operations/readiness/${encodeURIComponent(companyId)}/probe?environment=test`);
  console.log('--- NETWORK PREFLIGHT (NO DPS SENT) ---');
  console.log(JSON.stringify(probe, null, 2));

  if (!probe.ready_to_enable_live) {
    console.error('Produção Restrita is NOT ready to enable live transmission. Resolve failed gates first.');
    process.exitCode = 2;
    return;
  }
  console.log('Preflight passed. Live switches may be enabled only after the DPS builder has been verified against the active XSD/layout.');
}

async function call(method: string, path: string) {
  const response = await fetch(`${api}${path}`, { method, headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' } });
  const raw = await response.text();
  let body: any = raw;
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* preserve raw */ }
  if (!response.ok) throw new Error(`TaxAgent ${response.status} ${path}: ${typeof body === 'string' ? body.slice(0, 1000) : JSON.stringify(body)}`);
  return body;
}
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
