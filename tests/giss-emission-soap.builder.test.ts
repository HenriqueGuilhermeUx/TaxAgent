import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { buildGissEmissionSoapEnvelope } from '../src/providers/giss/giss-emission-soap.builder';

test('builds exact RecepcionarLoteRps SOAP 1.1 envelope without transmitting', () => {
  const xml = buildGissEmissionSoapEnvelope({
    targetNamespace: 'http://nfse.abrasf.org.br',
    requestWrapper: 'RecepcionarLoteRpsRequest',
    soapVersion: '1.1',
    headerXml: '<cabecalho versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>',
    signedBatchXml: '<EnviarLoteRpsEnvio><LoteRps Id="LOTE1"><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/></LoteRps></EnviarLoteRpsEnvio>',
  });
  assert.match(xml, /http:\/\/schemas\.xmlsoap\.org\/soap\/envelope\//);
  assert.match(xml, /<tns:RecepcionarLoteRpsRequest>/);
  assert.match(xml, /<nfseCabecMsg>&lt;cabecalho/);
  assert.match(xml, /<nfseDadosMsg>&lt;EnviarLoteRpsEnvio/);
  assert.equal(xml.includes('<EnviarLoteRpsEnvio><LoteRps'), false);
});

test('refuses synchronous wrapper or unsigned batch', () => {
  assert.throws(
    () => buildGissEmissionSoapEnvelope({
      targetNamespace: 'http://nfse.abrasf.org.br',
      requestWrapper: 'RecepcionarLoteRpsSincronoRequest',
      soapVersion: '1.1',
      headerXml: '<cabecalho/>',
      signedBatchXml: '<EnviarLoteRpsEnvio><LoteRps><Signature/></LoteRps></EnviarLoteRpsEnvio>',
    }),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_GISS_EMISSION_WRAPPER_UNVERIFIED',
  );
  assert.throws(
    () => buildGissEmissionSoapEnvelope({
      targetNamespace: 'http://nfse.abrasf.org.br',
      requestWrapper: 'RecepcionarLoteRpsRequest',
      soapVersion: '1.1',
      headerXml: '<cabecalho/>',
      signedBatchXml: '<EnviarLoteRpsEnvio><LoteRps/></EnviarLoteRpsEnvio>',
    }),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_GISS_EMISSION_BATCH_INVALID',
  );
});
