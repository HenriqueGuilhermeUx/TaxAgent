import assert from 'node:assert/strict';
import test from 'node:test';
import { GissClient } from '../src/providers/giss/giss.client';

test('prepareRpsQuery builds deterministic signed SOAP bytes from authenticated RTC WSDL evidence without POST', async () => {
  const signatures = {
    signRpsQuery: (xml: string) => xml.replace(
      '</ConsultarNfseRpsEnvio>',
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI=""/></SignedInfo></Signature></ConsultarNfseRpsEnvio>',
    ),
  };
  const client = new GissClient(signatures as any);
  (client as any).inspectWsdl = async () => ({
    host: 'ws-homologacao-rtc.giss.com.br',
    path: '/service-ws/nf/nfse-ws',
    status: 200,
    reachable: true,
    bytes: 1,
    sha256: 'wsdl',
    targetNamespace: 'http://impl.webservice.ws.declaracao.eicon.com.br/',
    operations: ['ConsultarNfsePorRps'],
    soapActions: ['http://nfse.abrasf.org.br/ConsultarNfsePorRps'],
    soapAddresses: ['https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws'],
    operationBindings: [{ operation: 'ConsultarNfsePorRps', soapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps' }],
    requestWrappers: ['ConsultarNfsePorRpsRequest'],
    hasNfseCabecMsg: true,
    hasNfseDadosMsg: true,
    hasOutputXml: true,
    isWsdl: true,
    requiredOperationsPresent: true,
    reconciliationShapePresent: true,
    reconciliationTransportPresent: true,
    reconciliationSoapAddress: 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws',
    reconciliationSoapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps',
    reconciliationSoapVersion: '1.1',
    reconciliationRequestWrapper: 'ConsultarNfsePorRpsRequest',
    reconciliationRequestNamespace: 'http://nfse.abrasf.org.br',
    reconciliationResponseWrapper: 'ConsultarNfsePorRpsResponse',
    reconciliationResponseNamespace: 'http://nfse.abrasf.org.br',
    requestMessageParts: ['parameters'],
    responseMessageParts: ['parameters'],
    supportingDocumentsInspected: 1,
    sameHostImportsDiscovered: 1,
    missingRequiredOperations: [],
  });

  const prepared = await client.prepareRpsQuery(
    '3548500',
    { providerTaxId: '12345678000190', number: '9', series: 'TA' },
    {} as any,
  );

  assert.equal(prepared.fiscalTransmissionAttempted, false);
  assert.equal(prepared.queryAttempted, false);
  assert.equal(prepared.queryDataSigned, true);
  assert.equal(prepared.querySignatureProfile, 'xmldsig-rsa-sha1-empty-uri');
  assert.equal(prepared.soapVersion, '1.1');
  assert.equal(prepared.requestWrapper, 'ConsultarNfsePorRpsRequest');
  assert.equal(prepared.targetNamespace, 'http://nfse.abrasf.org.br');
  assert.match(prepared.body, /<tns:ConsultarNfsePorRpsRequest>/);
  assert.match(prepared.body, /http:\/\/www\.giss\.com\.br\/cabecalho-v2_04\.xsd/);
  assert.match(prepared.body, /http:\/\/www\.giss\.com\.br\/consultar-nfse-rps-envio-v2_04\.xsd/);
  assert.match(prepared.body, /Reference URI=&quot;&quot;/);
  assert.equal(prepared.bodySha256.length, 64);
});
