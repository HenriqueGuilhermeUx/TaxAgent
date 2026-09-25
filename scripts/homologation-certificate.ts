import { readFile } from 'node:fs/promises';

const api = (process.env.TAXAGENT_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const companyId = required('TAXAGENT_COMPANY_ID');
const apiKey = required('TAXAGENT_API_KEY');
const a1Path = required('TAXAGENT_A1_PATH');

async function main() {
  const password = await certificatePassword();
  const pfx = await readFile(a1Path);
  if (pfx.length < 64) throw new Error('A1 file is empty or unexpectedly small');
  const response = await fetch(`${api}/v1/companies/${encodeURIComponent(companyId)}/certificates`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ pfx_base64: pfx.toString('base64'), password }),
  });
  const raw = await response.text();
  let body: any = raw;
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* preserve raw */ }
  if (!response.ok) throw new Error(`Certificate upload failed (${response.status}): ${typeof body === 'string' ? body.slice(0, 1000) : JSON.stringify(body)}`);
  console.log(JSON.stringify({
    certificate_id: body.id,
    company_id: body.company_id,
    status: body.status,
    fingerprint: body.fingerprint,
    validFrom: body.validFrom,
    validTo: body.validTo,
    note: 'The PFX and password were sent only to the configured TaxAgent API and were not printed.',
  }, null, 2));
}

async function certificatePassword(): Promise<string> {
  const passwordFile = process.env.TAXAGENT_A1_PASSWORD_FILE;
  if (passwordFile) return (await readFile(passwordFile, 'utf8')).replace(/[\r\n]+$/, '');
  const password = process.env.TAXAGENT_A1_PASSWORD;
  if (!password) throw new Error('Set TAXAGENT_A1_PASSWORD_FILE (recommended) or TAXAGENT_A1_PASSWORD locally');
  return password;
}
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
