import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGissSoapEnvelope } from '../src/providers/giss/giss-soap.builder';

test('wraps ABRASF XML in deterministic GISS SOAP envelope without transmitting', () => {
  const soap = buildGissSoapEnvelope({ operation: 'RecepcionarLoteRps', xml: '<EnviarLoteRpsEnvio><LoteRps/></EnviarLoteRpsEnvio>' });
  assert.match(soap, /soapenv:Envelope/);
  assert.match(soap, /RecepcionarLoteRps/);
  assert.match(soap, /&lt;EnviarLoteRpsEnvio&gt;/);
  assert.doesNotMatch(soap, /<EnviarLoteRpsEnvio>/);
});
