import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGissResponse } from '../src/providers/giss/giss-response.parser';

test('parses an authorized ABRASF response', () => {
  const r = parseGissResponse('<GerarNfseResposta><ListaNfse><CompNfse><Nfse><InfNfse><Numero>42</Numero><CodigoVerificacao>ABC123</CodigoVerificacao></InfNfse></Nfse></CompNfse></ListaNfse></GerarNfseResposta>');
  assert.equal(r.authorized, true); assert.equal(r.nfseNumber, '42'); assert.equal(r.verificationCode, 'ABC123');
});

test('parses a structured ABRASF rejection', () => {
  const r = parseGissResponse('<ListaMensagemRetorno><MensagemRetorno><Codigo>E001</Codigo><Mensagem>Rejeitado</Mensagem></MensagemRetorno></ListaMensagemRetorno>');
  assert.equal(r.authorized, false); assert.equal(r.errorCode, 'E001');
});

test('parses escaped outputXML from verified SOAP response wrapper', () => {
  const r = parseGissResponse('<ConsultarNfsePorRpsResponse><outputXML>&lt;ConsultarNfseRpsResposta&gt;&lt;CompNfse&gt;&lt;Nfse&gt;&lt;InfNfse&gt;&lt;Numero&gt;77&lt;/Numero&gt;&lt;CodigoVerificacao&gt;XYZ&lt;/CodigoVerificacao&gt;&lt;/InfNfse&gt;&lt;/Nfse&gt;&lt;/CompNfse&gt;&lt;/ConsultarNfseRpsResposta&gt;</outputXML></ConsultarNfsePorRpsResponse>');
  assert.equal(r.authorized, true);
  assert.equal(r.nfseNumber, '77');
  assert.equal(r.verificationCode, 'XYZ');
});
