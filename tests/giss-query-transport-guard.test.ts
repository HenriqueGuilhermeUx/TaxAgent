import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { requireVerifiedGissReconciliationTransport } from '../src/providers/giss/giss-query-transport.guard';

test('returns exact SOAP address/action/version and ABRASF wrapper only when reconciliation contract is fully proven', () => {
  const result = requireVerifiedGissReconciliationTransport({
    reachable: true,
    isWsdl: true,
    requiredOperationsPresent: true,
    reconciliationShapePresent: true,
    reconciliationTransportPresent: true,
    reconciliationSoapAddress: 'https://example.test/nfse-ws',
    reconciliationSoapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps',
    reconciliationSoapVersion: '1.1',
    reconciliationRequestWrapper: 'ConsultarNfsePorRpsRequest',
    reconciliationRequestNamespace: 'http://nfse.abrasf.org.br',
    reconciliationResponseWrapper: 'ConsultarNfsePorRpsResponse',
    reconciliationResponseNamespace: 'http://nfse.abrasf.org.br',
  });
  assert.equal(result.soapAddress, 'https://example.test/nfse-ws');
  assert.equal(result.soapAction, 'http://nfse.abrasf.org.br/ConsultarNfsePorRps');
  assert.equal(result.soapVersion, '1.1');
  assert.equal(result.requestWrapper, 'ConsultarNfsePorRpsRequest');
  assert.equal(result.requestNamespace, 'http://nfse.abrasf.org.br');
});

test('fails closed before any query when request/response schema evidence is incomplete', () => {
  assert.throws(
    () => requireVerifiedGissReconciliationTransport({
      reachable: true,
      isWsdl: true,
      requiredOperationsPresent: true,
      reconciliationShapePresent: true,
      reconciliationTransportPresent: true,
      reconciliationSoapAddress: 'https://example.test/nfse-ws',
      reconciliationSoapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps',
      reconciliationSoapVersion: '1.1',
    }),
    (error: unknown) => error instanceof FiscalEngineError
      && error.code === 'TA_GISS_RECONCILIATION_CONTRACT_UNVERIFIED'
      && error.retryable === false,
  );
});
