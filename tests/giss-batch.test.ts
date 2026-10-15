import assert from 'node:assert/strict';
import test from 'node:test';
import { GISS_TYPES_NAMESPACE } from '../src/providers/giss/abrasf-rps.builder';
import { buildAbrasfLoteRps, GISS_SEND_BATCH_NAMESPACE } from '../src/providers/giss/giss-batch.builder';

test('builds one-RPS GISS 2.04 batch deterministically in the official send/types namespaces', () => {
  const rps = `<tipos:Rps xmlns:tipos="${GISS_TYPES_NAMESPACE}"><tipos:InfDeclaracaoPrestacaoServico Id="RPS77"></tipos:InfDeclaracaoPrestacaoServico></tipos:Rps>`;
  const xml = buildAbrasfLoteRps({ batchNumber: '9001', providerTaxId: '12.345.678/0001-90', municipalRegistration: '123', rpsXml: rps });
  assert.match(xml, new RegExp(`<EnviarLoteRpsEnvio xmlns="${GISS_SEND_BATCH_NAMESPACE.replaceAll('.', '\\.')}`));
  assert.match(xml, new RegExp(`xmlns:tipos="${GISS_TYPES_NAMESPACE.replaceAll('.', '\\.')}`));
  assert.match(xml, /<LoteRps Id="LOTE9001" versao="2.04">/);
  assert.match(xml, /<tipos:Prestador><tipos:CpfCnpj><tipos:Cnpj>12345678000190<\/tipos:Cnpj><\/tipos:CpfCnpj><tipos:InscricaoMunicipal>123<\/tipos:InscricaoMunicipal><\/tipos:Prestador>/);
  assert.match(xml, /<tipos:QuantidadeRps>1<\/tipos:QuantidadeRps>/);
  assert.match(xml, /<tipos:ListaRps><tipos:Rps/);
});
