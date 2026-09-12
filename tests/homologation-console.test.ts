import assert from 'node:assert/strict';
import test from 'node:test';
import { fiscalAutopilotHtml } from '../src/homologation-console/autopilot.page';
import { companyCorrectionHtml } from '../src/homologation-console/company-correction.page';
import { prepareHomologationConsoleHtml } from '../src/homologation-console/homologation-console.controller';
import { homologationConsoleHtml } from '../src/homologation-console/homologation-console.page';

test('homologation console exposes browser-only fiscal workflow without browser persistence', () => {
  const html = prepareHomologationConsoleHtml(homologationConsoleHtml());
  assert.match(html, /Console de Homologação/);
  assert.match(html, /certificates\/upload/);
  assert.match(html, /operations\/no-a1\/validate/);
  assert.match(html, /Validar pré-A1/);
  assert.match(html, /validateNoA1/);
  assert.match(html, /operations\/dps\/prebuild/);
  assert.match(html, /operations\/dps\/prepare/);
  assert.match(html, /operations\/dps\/prepared/);
  assert.match(html, /operations\/dps\/validate/);
  assert.match(html, /Congelar Prepared DPS/);
  assert.match(html, /Assinar Prepared DPS com A1/);
  assert.match(html, /Prepared DPS ID/);
  assert.match(html, /prepared_dps_id/);
  assert.match(html, /restorePreparedPayload/);
  assert.match(html, /resume_payload/);
  assert.match(html, /customerTaxId/);
  assert.match(html, /serviceDescription/);
  assert.match(html, /tax\/resolve/);
  assert.match(html, /YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS/);
  assert.match(html, /Consultoria empresarial padrão \(TaxAgent\)/);
  assert.match(html, /service_profile:val\('serviceProfile'\)/);
  assert.match(html, /iss_withholding:val\('taxIssWithholding'\)/);
  assert.match(html, /result\.municipal_tax\.iss_rate/);

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.ok(script.length > 0, 'inline console script must exist');
  assert.doesNotMatch(script, /localStorage\s*[.\[]/);
  assert.doesNotMatch(script, /sessionStorage\s*[.\[]/);
  assert.doesNotMatch(script, /console\.(?:log|debug|info)\s*\(/);
});

test('served homologation console uses the browser local calendar date instead of UTC date', () => {
  const html = prepareHomologationConsoleHtml(homologationConsoleHtml());
  assert.doesNotMatch(html, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
  assert.match(html, /now\.getFullYear\(\)/);
  assert.match(html, /now\.getMonth\(\)\+1/);
  assert.match(html, /now\.getDate\(\)/);
});

test('fiscal autopilot page exposes a one-click human-first flow without browser persistence', () => {
  const html = fiscalAutopilotHtml();
  assert.match(html, /Autopilot fiscal/);
  assert.match(html, /Resolver e preparar automaticamente/);
  assert.match(html, /fiscal\/autopilot/);
  assert.match(html, /fiscal\/autopilot\/context/);
  assert.match(html, /identifica automaticamente a Company/);
  assert.match(html, /Carregar clientes salvos/);
  assert.doesNotMatch(html, /<label>Company ID<\/label>/);
  assert.match(html, /id="companyId" type="hidden"/);
  assert.match(html, /Continuar automaticamente/);
  assert.match(html, /O cliente vai reter ISS/);
  assert.match(html, /certificates\/upload/);
  assert.doesNotMatch(html, /cClassTrib/);
  assert.doesNotMatch(html, /cIndOp/);

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.ok(script.length > 0, 'inline autopilot script must exist');
  assert.doesNotMatch(script, /localStorage\s*[.\[]/);
  assert.doesNotMatch(script, /sessionStorage\s*[.\[]/);
  assert.doesNotMatch(script, /console\.(?:log|debug|info)\s*\(/);
});

test('company correction tool patches an existing company and can replace a lost TEST key without browser persistence', () => {
  const html = companyCorrectionHtml();
  assert.match(html, /Corrigir cadastro da Company/);
  assert.match(html, /Corrigir município/);
  assert.match(html, /companyRequest\('PATCH',\{city_code:city\}\)/);
  assert.match(html, /x-taxagent-bootstrap-token/);
  assert.match(html, /CNPJ, Organization e API keys foram preservados/);
  assert.match(html, /Gerar nova API key TEST/);
  assert.match(html, /\/api-keys/);
  assert.match(html, /environment:'test'/);
  assert.match(html, /scopes:\['\*'\]/);
  assert.match(html, /ta_test_/);

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.ok(script.length > 0, 'inline correction script must exist');
  assert.doesNotMatch(script, /localStorage\s*[.\[]/);
  assert.doesNotMatch(script, /sessionStorage\s*[.\[]/);
  assert.doesNotMatch(script, /console\.(?:log|debug|info)\s*\(/);
});
