import assert from 'node:assert/strict';
import test from 'node:test';
import { companyCorrectionHtml } from '../src/homologation-console/company-correction.page';
import { useBrowserLocalDateDefaults } from '../src/homologation-console/homologation-console.controller';
import { homologationConsoleHtml } from '../src/homologation-console/homologation-console.page';

test('homologation console exposes browser-only fiscal workflow without browser persistence', () => {
  const html = homologationConsoleHtml();
  assert.match(html, /Console de Homologação/);
  assert.match(html, /certificates\/upload/);
  assert.match(html, /operations\/dps\/validate/);
  assert.match(html, /tax\/resolve/);
  assert.match(html, /YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS/);

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.ok(script.length > 0, 'inline console script must exist');
  assert.doesNotMatch(script, /localStorage\s*[.\[]/);
  assert.doesNotMatch(script, /sessionStorage\s*[.\[]/);
  assert.doesNotMatch(script, /console\.(?:log|debug|info)\s*\(/);
});

test('served homologation console uses the browser local calendar date instead of UTC date', () => {
  const html = useBrowserLocalDateDefaults(homologationConsoleHtml());
  assert.doesNotMatch(html, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
  assert.match(html, /now\.getFullYear\(\)/);
  assert.match(html, /now\.getMonth\(\)\+1/);
  assert.match(html, /now\.getDate\(\)/);
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
