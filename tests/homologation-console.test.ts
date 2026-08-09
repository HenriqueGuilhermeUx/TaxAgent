import assert from 'node:assert/strict';
import test from 'node:test';
import { homologationConsoleHtml } from '../src/homologation-console/homologation-console.page';

test('homologation console exposes browser-only fiscal workflow without browser persistence', () => {
  const html = homologationConsoleHtml();
  assert.match(html, /Console de Homologação/);
  assert.match(html, /certificates\/upload/);
  assert.match(html, /operations\/dps\/validate/);
  assert.match(html, /tax\/resolve/);
  assert.match(html, /YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS/);
  assert.doesNotMatch(html, /localStorage\s*\./);
  assert.doesNotMatch(html, /sessionStorage\s*\./);
  assert.doesNotMatch(html, /console\.log/);
});
