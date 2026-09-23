import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAbrasfRps } from '../src/providers/giss/abrasf-rps.builder';

const base = {
  number: '77',
  series: 'TA',
  issuedAt: '2026-09-22T18:30:00-03:00',
  providerTaxId: '12.345.678/0001-90',
  municipalRegistration: null,
  customerTaxId: '123.456.789-01',
  customerName: 'Cliente Teste',
  customerAddress: { street: 'Rua Teste', number: '1', district: 'Centro', postalCode: '11010000', cityCode: '3548500' },
  serviceCode: '170101',
  nbsCode: '114011900',
  description: 'Consultoria',
  amount: 100,
  issRate: 3,
  issWithholding: '1' as const,
  issExigibility: '1' as const,
  serviceCityCode: '3548500',
};

test('builds current GISS RPS fields required by the ABRASF-derived schema', () => {
  const xml = buildAbrasfRps(base);
  assert.match(xml, /<DataEmissao>2026-09-22<\/DataEmissao>/);
  assert.match(xml, /<ItemListaServico>17\.01<\/ItemListaServico>/);
  assert.match(xml, /<CodigoNbs>114011900<\/CodigoNbs>/);
  assert.match(xml, /<ExigibilidadeISS>1<\/ExigibilidadeISS>/);
  assert.match(xml, /<IssRetido>2<\/IssRetido>/);
  assert.match(xml, /<TomadorServico>/);
  assert.match(xml, /<Uf>SP<\/Uf>/);
  assert.match(xml, /<Cep>11010000<\/Cep>/);
});

test('maps national ISS retention choices to GISS retention fields', () => {
  const tomador = buildAbrasfRps({ ...base, issWithholding: '2' });
  assert.match(tomador, /<IssRetido>1<\/IssRetido><ResponsavelRetencao>1<\/ResponsavelRetencao>/);
  const intermediario = buildAbrasfRps({ ...base, issWithholding: '3' });
  assert.match(intermediario, /<IssRetido>1<\/IssRetido><ResponsavelRetencao>2<\/ResponsavelRetencao>/);
});
