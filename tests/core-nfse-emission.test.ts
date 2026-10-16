import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { homologationConsoleHtml } from '../src/homologation-console/homologation-console.page';

test('homologation console requires Prepared DPS before first real invoice request', () => {
  const html = homologationConsoleHtml();
  assert.match(html, /\/v1\/operations\/dps\/prepare/);
  assert.match(html, /\/v1\/operations\/dps\/prepared\/.*\/sign/);
  assert.match(html, /prepared_dps_id/);
  assert.match(html, /Prepared DPS imutável/);
  assert.match(html, /ready_for_transmission/);
  assert.match(html, /YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
});

test('homologation console exposes truthful core emission diagnostics', () => {
  const html = homologationConsoleHtml();
  assert.match(html, /Status real da emissão/);
  assert.match(html, /issuer-readiness/);
  assert.match(html, /core-status\?environment=test/);
  assert.match(html, /prova operacional/i);
});

test('first invoice script prepares and signs immutable DPS before POST invoices', async () => {
  const script = await readFile('scripts/homologation-first-invoice.ts', 'utf8');
  const prepare = script.indexOf('/v1/operations/dps/prepare');
  const sign = script.indexOf('/sign');
  const invoices = script.indexOf('/v1/invoices');
  assert.ok(prepare >= 0);
  assert.ok(sign > prepare);
  assert.ok(invoices > sign);
  assert.match(script, /signed\.resume_payload/);
  assert.match(script, /authorization_proven: false/);
  assert.match(script, /status=authorized/);
});
