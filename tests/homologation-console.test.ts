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

  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.ok(script.length > 0, 'inline console script must exist');
  assert.doesNotMatch(script, /localStorage\s*[.\[]/);
  assert.doesNotMatch(script, /sessionStorage\s*[.\[]/);
  assert.doesNotMatch(script, /console\.(?:log|debug|info)\s*\(/);
});
