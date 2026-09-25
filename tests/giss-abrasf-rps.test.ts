import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAbrasfRps, GISS_TYPES_NAMESPACE } from '../src/providers/giss/abrasf-rps.builder';

test('builds deterministic GISS 2.04 RPS in the official types namespace without network side effects', () => {
  const xml = buildAbrasfRps({
    number: '1', series: 'TA', issuedAt: '2026-09-22T18:30:00-03:00',
    providerTaxId: '12345678000190', customerTaxId: '12345678901',
    customerName: 'Cliente & Teste',
    customerAddress: { street: 'Rua Teste', number: '1', district: 'Centro', postalCode: '11010000', cityCode: '3548500' },
    serviceCode: '17.01', nbsCode: '114011900',
    description: 'Consultoria <empresarial>', amount: 100, issRate: 3,
    issWithholding: '1', issExigibility: '1', serviceCityCode: '3548500',
  });
  assert.match(xml, new RegExp(`<tipos:Rps xmlns:tipos="${GISS_TYPES_NAMESPACE.replaceAll('.', '\\.')}">`));
  assert.match(xml, /<tipos:Numero>1<\/tipos:Numero>/);
  assert.match(xml, /<tipos:ItemListaServico>17.01<\/tipos:ItemListaServico>/);
  assert.match(xml, /<tipos:CodigoNbs>114011900<\/tipos:CodigoNbs>/);
  assert.match(xml, /<tipos:ValorServicos>100.00<\/tipos:ValorServicos>/);
  assert.match(xml, /<tipos:Aliquota>0.0300<\/tipos:Aliquota>/);
  assert.match(xml, /Cliente &amp; Teste/);
  assert.match(xml, /Consultoria &lt;empresarial&gt;/);
  assert.match(xml, /<tipos:CodigoMunicipio>3548500<\/tipos:CodigoMunicipio>/);
});
