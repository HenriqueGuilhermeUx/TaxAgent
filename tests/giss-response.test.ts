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
