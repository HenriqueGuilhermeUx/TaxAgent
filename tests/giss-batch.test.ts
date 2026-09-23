import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAbrasfLoteRps } from '../src/providers/giss/giss-batch.builder';

test('builds one-RPS ABRASF 2.04 batch deterministically', () => {
  const rps = '<Rps><InfDeclaracaoPrestacaoServico Id="RPS77"></InfDeclaracaoPrestacaoServico></Rps>';
  const xml = buildAbrasfLoteRps({ batchNumber: '9001', providerTaxId: '12.345.678/0001-90', municipalRegistration: '123', rpsXml: rps });
  assert.match(xml, /EnviarLoteRpsEnvio/);
  assert.match(xml, /<LoteRps Id="LOTE9001" versao="2.04">/);
  assert.match(xml, /<Prestador><CpfCnpj><Cnpj>12345678000190<\/Cnpj><\/CpfCnpj><InscricaoMunicipal>123<\/InscricaoMunicipal><\/Prestador>/);
  assert.match(xml, /<QuantidadeRps>1<\/QuantidadeRps>/);
  assert.match(xml, /<ListaRps><Rps>/);
});
