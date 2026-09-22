import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGissSoapEnvelope } from '../src/providers/giss/giss-soap.builder';

test('wraps ABRASF XML in deterministic GISS SOAP envelope without transmitting', () => {
  const soap = buildGissSoapEnvelope({ operation: 'RecepcionarLoteRpsSincrono', xml: '<EnviarLoteRpsSincronoEnvio><LoteRps/></EnviarLoteRpsSincronoEnvio>' });
  assert.match(soap, /soapenv:Envelope/);
  assert.match(soap, /RecepcionarLoteRpsSincrono/);
  assert.match(soap, /&lt;EnviarLoteRpsSincronoEnvio&gt;/);
  assert.doesNotMatch(soap, /<EnviarLoteRpsSincronoEnvio>/);
});
