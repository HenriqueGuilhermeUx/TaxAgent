import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { requireVerifiedGissReconciliationTransport } from '../src/providers/giss/giss-query-transport.guard';

test('returns exact SOAP address/action only when authenticated reconciliation contract is fully proven', () => {
  const result = requireVerifiedGissReconciliationTransport({
    reachable: true,
    isWsdl: true,
    requiredOperationsPresent: true,
    reconciliationShapePresent: true,
    reconciliationTransportPresent: true,
    reconciliationSoapAddress: 'https://example.test/nfse-ws',
    reconciliationSoapAction: 'urn:ConsultarNfsePorRps',
    targetNamespace: 'urn:nfse',
  });
  assert.equal(result.soapAddress, 'https://example.test/nfse-ws');
  assert.equal(result.soapAction, 'urn:ConsultarNfsePorRps');
});

test('fails closed before any query when endpoint/action evidence is incomplete', () => {
  assert.throws(
    () => requireVerifiedGissReconciliationTransport({
      reachable: true,
      isWsdl: true,
      requiredOperationsPresent: true,
      reconciliationShapePresent: true,
      reconciliationTransportPresent: false,
    }),
    (error: unknown) => error instanceof FiscalEngineError
      && error.code === 'TA_GISS_RECONCILIATION_CONTRACT_UNVERIFIED'
      && error.retryable === false,
  );
});
