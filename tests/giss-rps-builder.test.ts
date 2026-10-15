import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAbrasfRps, GISS_TYPES_NAMESPACE } from '../src/providers/giss/abrasf-rps.builder';

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

test('builds current GISS 2.04 RPS fields in the official types namespace', () => {
  const xml = buildAbrasfRps(base);
  assert.match(xml, new RegExp(`xmlns:tipos="${GISS_TYPES_NAMESPACE.replaceAll('.', '\\.')}`));
  assert.match(xml, /<tipos:DataEmissao>2026-09-22<\/tipos:DataEmissao>/);
  assert.match(xml, /<tipos:ItemListaServico>17\.01<\/tipos:ItemListaServico>/);
  assert.match(xml, /<tipos:CodigoNbs>114011900<\/tipos:CodigoNbs>/);
  assert.match(xml, /<tipos:ExigibilidadeISS>1<\/tipos:ExigibilidadeISS>/);
  assert.match(xml, /<tipos:IssRetido>2<\/tipos:IssRetido>/);
  assert.match(xml, /<tipos:TomadorServico>/);
  assert.match(xml, /<tipos:Uf>SP<\/tipos:Uf>/);
  assert.match(xml, /<tipos:Cep>11010000<\/tipos:Cep>/);
});

test('maps national ISS retention choices to GISS namespaced retention fields', () => {
  const tomador = buildAbrasfRps({ ...base, issWithholding: '2' });
  assert.match(tomador, /<tipos:IssRetido>1<\/tipos:IssRetido><tipos:ResponsavelRetencao>1<\/tipos:ResponsavelRetencao>/);
  const intermediario = buildAbrasfRps({ ...base, issWithholding: '3' });
  assert.match(intermediario, /<tipos:IssRetido>1<\/tipos:IssRetido><tipos:ResponsavelRetencao>2<\/tipos:ResponsavelRetencao>/);
});
