import assert from 'node:assert/strict';
import test from 'node:test';
import { evidencePortalHtml } from '../src/evidence/evidence-portal.page';

test('TaxAgent evidence portal is branded and keeps document-engine details private', () => {
  const html = evidencePortalHtml();
  assert.match(html, /TaxAgent · Evidências & Inteligência Fiscal/i);
  assert.match(html, /Mudanças fiscais aplicáveis/i);
  assert.match(html, /Dossiê mensal/i);
  assert.match(html, /operational_evidence_completeness/);
  assert.doesNotMatch(html, /DocWallet/i);
  assert.doesNotMatch(html, /localStorage\.setItem|sessionStorage\.setItem/i);
  assert.match(html, /arquivo bruto fica no cofre documental privado/i);
});
