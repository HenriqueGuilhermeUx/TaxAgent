import assert from 'node:assert/strict';
import test from 'node:test';
import { GissClient } from '../src/providers/giss/giss.client';

test('prepareRpsQuery builds deterministic SOAP bytes from authenticated WSDL evidence without POST', async () => {
  const client = new GissClient();
  (client as any).inspectWsdl = async () => ({
    host: 'ws-homologacao.giss.com.br',
    path: '/service-ws/nf/nfse-ws',
    status: 200,
    reachable: true,
    bytes: 1,
    sha256: 'wsdl',
    targetNamespace: 'http://nfse.abrasf.org.br',
    operations: ['ConsultarNfsePorRps'],
    soapActions: ['http://nfse.abrasf.org.br/ConsultarNfsePorRps'],
    soapAddresses: ['https://ws-homologacao.giss.com.br/service-ws/nf/nfse-ws'],
    operationBindings: [{ operation: 'ConsultarNfsePorRps', soapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps' }],
    requestWrappers: ['ConsultarNfsePorRpsRequest'],
    hasNfseCabecMsg: true,
    hasNfseDadosMsg: true,
    hasOutputXml: true,
    isWsdl: true,
    requiredOperationsPresent: true,
    reconciliationShapePresent: true,
    reconciliationTransportPresent: true,
    reconciliationSoapAddress: 'https://ws-homologacao.giss.com.br/service-ws/nf/nfse-ws',
    reconciliationSoapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps',
    reconciliationSoapVersion: '1.1',
    missingRequiredOperations: [],
  });

  const prepared = await client.prepareRpsQuery(
    '3548500',
    { providerTaxId: '12345678000190', number: '9', series: 'TA' },
    {} as any,
  );

  assert.equal(prepared.fiscalTransmissionAttempted, false);
  assert.equal(prepared.queryAttempted, false);
  assert.equal(prepared.soapVersion, '1.1');
  assert.equal(prepared.requestWrapper, 'ConsultarNfsePorRpsRequest');
  assert.match(prepared.body, /nfseCabecMsg/);
  assert.match(prepared.body, /nfseDadosMsg/);
  assert.equal(prepared.bodySha256.length, 64);
});
