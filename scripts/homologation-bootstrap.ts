type Json = Record<string, any>;
const api = (process.env.TAXAGENT_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const bootstrapToken = required('TAXAGENT_BOOTSTRAP_TOKEN');
const orgName = process.env.TAXAGENT_HOMO_ORG_NAME ?? 'TaxAgent Homologation';
const companyName = required('TAXAGENT_HOMO_COMPANY_NAME'); const taxId = required('TAXAGENT_HOMO_TAX_ID'); const cityCode = required('TAXAGENT_HOMO_CITY_CODE'); const municipalRegistration = process.env.TAXAGENT_HOMO_MUNICIPAL_REGISTRATION; const taxRegime = process.env.TAXAGENT_HOMO_TAX_REGIME ?? 'regular';
async function main() {
  const organization = await request('/v1/organizations', { method: 'POST', headers: bootstrapHeaders(), body: JSON.stringify({ name: orgName }) });
  const company = await request(`/v1/organizations/${encodeURIComponent(organization.id)}/companies`, { method: 'POST', headers: bootstrapHeaders(), body: JSON.stringify({ name: companyName, tax_id: taxId, city_code: cityCode, ...(municipalRegistration ? { municipal_registration: municipalRegistration } : {}), tax_regime: taxRegime }) });
  const key = await request(`/v1/companies/${encodeURIComponent(company.id)}/api-keys`, { method: 'POST', headers: bootstrapHeaders(), body: JSON.stringify({ name: 'Produção Restrita homologation', environment: 'test', scopes: ['operations:read', 'operations:write', 'certificates:read', 'certificates:write', 'invoices:read', 'invoices:write', 'documents:read', 'parameters:read', 'tax:resolve', 'tax:read'] }) });
  console.log(JSON.stringify({ organization_id: organization.id, company_id: company.id, api_key: key.key, environment: 'test', warning: 'The raw API key is shown only now. Store it in a secret manager; TaxAgent stores only its hash.' }, null, 2));
}
function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
function bootstrapHeaders() { return { 'content-type': 'application/json', 'x-taxagent-bootstrap-token': bootstrapToken }; }
async function request(path: string, init: RequestInit): Promise<Json> { const response = await fetch(`${api}${path}`, init); const raw = await response.text(); let body: any = raw; try { body = raw ? JSON.parse(raw) : {}; } catch {} if (!response.ok) throw new Error(`TaxAgent ${response.status} ${path}: ${typeof body === 'string' ? body.slice(0, 1000) : JSON.stringify(body)}`); return body as Json; }
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
