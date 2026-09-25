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

test('preserves GISS V999 wrapper and extracts nested ABRASF E174 detail', () => {
  const nested = '&lt;Codigo&gt;V999&lt;/Codigo&gt;&lt;Mensagem&gt;E174 - RPS não assinado. Assine o RPS&lt;/Mensagem&gt;';
  const r = parseGissResponse(`<ConsultarNfsePorRpsResponse><outputXML>&lt;ConsultarNfseRpsResposta&gt;&lt;ListaMensagemRetorno&gt;&lt;MensagemRetorno&gt;&lt;Codigo&gt;V999&lt;/Codigo&gt;&lt;Mensagem&gt;${nested.replaceAll('&', '&amp;')}&lt;/Mensagem&gt;&lt;/MensagemRetorno&gt;&lt;/ListaMensagemRetorno&gt;&lt;/ConsultarNfseRpsResposta&gt;</outputXML></ConsultarNfsePorRpsResponse>`);
  assert.equal(r.authorized, false);
  assert.equal(r.errorCode, 'V999');
  assert.equal(r.detailCode, 'E174');
  assert.match(r.detailMessage ?? '', /RPS não assinado/i);
});

test('parses SOAP 1.1 Fault as a structured unknown reconciliation response', () => {
  const r = parseGissResponse('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Client</faultcode><faultstring>Invalid request</faultstring></soap:Fault></soap:Body></soap:Envelope>');
  assert.equal(r.authorized, false);
  assert.equal(r.errorCode, 'soap:Client');
  assert.equal(r.errorMessage, 'Invalid request');
});
