import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAbrasfRps } from '../src/providers/giss/abrasf-rps.builder';

test('builds deterministic ABRASF RPS without network side effects', () => {
  const xml = buildAbrasfRps({
    number: '1', series: 'TA', issuedAt: '2026-09-22T18:30:00-03:00',
    providerTaxId: '12345678000190', customerTaxId: '12345678901',
    customerName: 'Cliente & Teste', serviceCode: '17.01',
    description: 'Consultoria <empresarial>', amount: 100, issRate: 3,
    serviceCityCode: '3548500',
  });
  assert.match(xml, /<Numero>1<\/Numero>/);
  assert.match(xml, /<ItemListaServico>17.01<\/ItemListaServico>/);
  assert.match(xml, /<ValorServicos>100.00<\/ValorServicos>/);
  assert.match(xml, /<Aliquota>0.0300<\/Aliquota>/);
  assert.match(xml, /Cliente &amp; Teste/);
  assert.match(xml, /Consultoria &lt;empresarial&gt;/);
  assert.match(xml, /<CodigoMunicipio>3548500<\/CodigoMunicipio>/);
});
