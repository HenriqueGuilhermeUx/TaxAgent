import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConsultarNfsePorRps } from '../src/providers/giss/giss-query.builder';

test('builds deterministic ABRASF ConsultarNfsePorRps request', () => {
  const xml = buildConsultarNfsePorRps({ providerTaxId: '12.345.678/0001-90', municipalRegistration: '123', number: '77', series: 'TA' });
  assert.match(xml, /ConsultarNfseRpsEnvio/);
  assert.match(xml, /<Numero>77<\/Numero>/);
  assert.match(xml, /<Serie>TA<\/Serie>/);
  assert.match(xml, /<Cnpj>12345678000190<\/Cnpj>/);
  assert.match(xml, /<InscricaoMunicipal>123<\/InscricaoMunicipal>/);
});
