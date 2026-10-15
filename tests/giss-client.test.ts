import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { GissClient, inspectGissWsdlContract } from '../src/providers/giss/giss.client';

test('GISS WSDL probe refuses network access without client certificate material', async () => {
  const client = new GissClient();
  await assert.rejects(
    client.probe('3548500'),
    (error: unknown) => error instanceof FiscalEngineError
      && error.code === 'TA_GISS_CLIENT_CERTIFICATE_REQUIRED'
      && error.retryable === false,
  );
});

test('GISS WSDL contract only passes reconciliation gate when ConsultarNfsePorRps is really advertised', () => {
  const wsdl = `<?xml version="1.0"?><wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" targetNamespace="http://nfse.abrasf.org.br"><wsdl:portType><wsdl:operation name="ConsultarNfsePorRps"/></wsdl:portType><wsdl:binding><wsdl:operation name="ConsultarNfsePorRps"><soap:operation xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" soapAction="ConsultarNfsePorRps"/></wsdl:operation></wsdl:binding></wsdl:definitions>`;
  const result = inspectGissWsdlContract(wsdl);
  assert.equal(result.isWsdl, true);
  assert.equal(result.requiredOperationsPresent, true);
  assert.deepEqual(result.missingRequiredOperations, []);
  assert.ok(result.operations.includes('ConsultarNfsePorRps'));
});

test('GISS WSDL contract fails closed for HTML/login/error pages even with operation-looking text', () => {
  const result = inspectGissWsdlContract('<html><body>ConsultarNfsePorRps</body></html>');
  assert.equal(result.isWsdl, false);
  assert.equal(result.requiredOperationsPresent, false);
  assert.deepEqual(result.missingRequiredOperations, ['ConsultarNfsePorRps']);
});

test('GISS WSDL contract fails closed when reconciliation operation is absent', () => {
  const result = inspectGissWsdlContract('<?xml version="1.0"?><definitions><operation name="RecepcionarLoteRpsSincrono"/></definitions>');
  assert.equal(result.isWsdl, true);
  assert.equal(result.requiredOperationsPresent, false);
  assert.deepEqual(result.missingRequiredOperations, ['ConsultarNfsePorRps']);
});
