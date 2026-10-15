import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConsultarNfsePorRps } from '../src/providers/giss/giss-query.builder';

test('builds deterministic GISS 2.04 ConsultarNfsePorRps request', () => {
  const xml = buildConsultarNfsePorRps({ providerTaxId: '12.345.678/0001-90', municipalRegistration: '123', number: '77', series: 'TA' });
  assert.match(xml, /xmlns="http:\/\/www\.giss\.com\.br\/consultar-nfse-rps-envio-v2_04\.xsd"/);
  assert.match(xml, /xmlns:tipos="http:\/\/www\.giss\.com\.br\/tipos-v2_04\.xsd"/);
  assert.match(xml, /<tipos:Numero>77<\/tipos:Numero>/);
  assert.match(xml, /<tipos:Serie>TA<\/tipos:Serie>/);
  assert.match(xml, /<tipos:Cnpj>12345678000190<\/tipos:Cnpj>/);
  assert.match(xml, /<tipos:InscricaoMunicipal>123<\/tipos:InscricaoMunicipal>/);
});
