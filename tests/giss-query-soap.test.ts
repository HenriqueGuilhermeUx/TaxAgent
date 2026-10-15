import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { buildGissCabecalho } from '../src/providers/giss/giss-header.builder';
import { buildConsultarNfsePorRps } from '../src/providers/giss/giss-query.builder';
import { buildGissQuerySoapEnvelope } from '../src/providers/giss/giss-query-soap.builder';

test('builds document-literal wrapped ConsultarNfsePorRps SOAP request without transmitting', () => {
  const dataXml = buildConsultarNfsePorRps({ providerTaxId: '12345678000190', number: '7', series: 'TA' });
  const xml = buildGissQuerySoapEnvelope({
    targetNamespace: 'http://nfse.abrasf.org.br',
    requestWrapper: 'ConsultarNfsePorRpsRequest',
    soapVersion: '1.1',
    headerXml: buildGissCabecalho(),
    dataXml,
  });
  assert.match(xml, /<tns:ConsultarNfsePorRpsRequest>/);
  assert.match(xml, /<nfseCabecMsg>&lt;cabecalho/);
  assert.match(xml, /<nfseDadosMsg>&lt;ConsultarNfseRpsEnvio/);
  assert.match(xml, /http:\/\/schemas\.xmlsoap\.org\/soap\/envelope\//);
});

test('refuses an unverified query wrapper', () => {
  assert.throws(
    () => buildGissQuerySoapEnvelope({ targetNamespace: 'urn:nfse', requestWrapper: 'GuessRequest', soapVersion: '1.1', headerXml: buildGissCabecalho(), dataXml: '<ConsultarNfseRpsEnvio/>' }),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_GISS_QUERY_WRAPPER_UNVERIFIED',
  );
});
