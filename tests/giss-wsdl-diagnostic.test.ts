import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { GissWsdlDiagnosticService } from '../src/operations/giss-wsdl-diagnostic.service';

test('GISS WSDL/query diagnostic is test-only and does not touch certificate, tenancy or network in production', async () => {
  let vaultCalls = 0;
  let clientCalls = 0;
  let tenancyCalls = 0;
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => { vaultCalls += 1; return {} as any; } } as any,
    { inspectWsdl: async () => { clientCalls += 1; return {} as any; }, prepareRpsQuery: async () => { clientCalls += 1; return {} as any; } } as any,
    { getCompany: async () => { tenancyCalls += 1; return {} as any; } } as any,
  );
  await assert.rejects(service.inspect('comp_1', 'production', '3548500'), BadRequestException);
  await assert.rejects(service.prepareQuery('comp_1', 'production', '3548500'), BadRequestException);
  assert.equal(vaultCalls, 0);
  assert.equal(clientCalls, 0);
  assert.equal(tenancyCalls, 0);
});

test('GISS WSDL diagnostic exposes contract metadata without returning certificate material', async () => {
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => ({ fingerprint: 'fp_test', tlsCertificatePem: 'SECRET_CERT', tlsPrivateKeyPem: 'SECRET_KEY' }) } as any,
    { inspectWsdl: async () => ({ host: 'ws-homologacao.giss.com.br', path: '/service-ws/nf/nfse-ws', status: 200, reachable: true, bytes: 1234, sha256: 'abc', operations: ['ConsultarNfsePorRps'], soapActions: ['action'] }) } as any,
    { getCompany: async () => ({}) } as any,
  );
  const result = await service.inspect('comp_1', 'test', '3548500');
  assert.equal(result.certificate_fingerprint, 'fp_test');
  assert.equal(result.fiscal_transmission_attempted, false);
  assert.equal(result.network_method, 'GET');
  assert.equal(JSON.stringify(result).includes('SECRET_CERT'), false);
  assert.equal(JSON.stringify(result).includes('SECRET_KEY'), false);
});

test('GISS query diagnostic prepares exact bytes with Company identity without exposing SOAP or certificate material', async () => {
  let preparedInput: any;
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => ({ fingerprint: 'fp_test', tlsCertificatePem: 'SECRET_CERT', tlsPrivateKeyPem: 'SECRET_KEY' }) } as any,
    {
      prepareRpsQuery: async (cityCode: string, input: unknown) => {
        preparedInput = { cityCode, input };
        return {
          soapAddress: 'https://ws-homologacao.giss.com.br/service-ws/nf/nfse-ws',
          soapAction: 'ConsultarNfsePorRps',
          soapVersion: '1.1',
          requestWrapper: 'ConsultarNfsePorRpsRequest',
          targetNamespace: 'http://tempuri.org/',
          body: '<soap:Envelope><ConsultarNfsePorRpsRequest><nfseCabecMsg>cab</nfseCabecMsg><nfseDadosMsg><ConsultarNfseRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd"></ConsultarNfseRpsEnvio></nfseDadosMsg></ConsultarNfsePorRpsRequest></soap:Envelope>',
          bodyBytes: 321,
          bodySha256: 'sha_test',
          fiscalTransmissionAttempted: false,
          queryAttempted: false,
        };
      },
    } as any,
    { getCompany: async () => ({ tax_id: '12345678000190', municipal_registration: null, city_code: '3548500' }) } as any,
  );

  const result = await service.prepareQuery('comp_1', 'test', '3548500', '77', 'TA');
  assert.equal(preparedInput.cityCode, '3548500');
  assert.deepEqual(preparedInput.input, { providerTaxId: '12345678000190', municipalRegistration: null, number: '77', series: 'TA' });
  assert.equal(result.endpoint, 'https://ws-homologacao.giss.com.br/service-ws/nf/nfse-ws');
  assert.equal(result.action, 'ConsultarNfsePorRps');
  assert.equal(result.soap_version, '1.1');
  assert.equal(result.namespace, 'http://tempuri.org/');
  assert.equal(result.request_sha256, 'sha_test');
  assert.equal(result.request_bytes, 321);
  assert.equal(result.shape.soap_envelope, true);
  assert.equal(result.shape.request_wrapper, true);
  assert.equal(result.shape.nfse_cabec_msg, true);
  assert.equal(result.shape.nfse_dados_msg, true);
  assert.equal(result.shape.consultar_nfse_rps_envio, true);
  assert.equal(result.fiscal_transmission_attempted, false);
  assert.equal(result.query_attempted, false);
  assert.equal(result.certificate_private_material_exposed, false);
  assert.equal(result.request_body_exposed, false);
  assert.equal(JSON.stringify(result).includes('SECRET_CERT'), false);
  assert.equal(JSON.stringify(result).includes('SECRET_KEY'), false);
  assert.equal(JSON.stringify(result).includes('<soap:Envelope>'), false);
});

test('GISS query diagnostic rejects service-location city as issuer before certificate/network access', async () => {
  let vaultCalls = 0;
  let clientCalls = 0;
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => { vaultCalls += 1; return {} as any; } } as any,
    { prepareRpsQuery: async () => { clientCalls += 1; return {} as any; } } as any,
    { getCompany: async () => ({ tax_id: '12345678000190', municipal_registration: null, city_code: '3548500' }) } as any,
  );

  await assert.rejects(service.prepareQuery('comp_1', 'test', '3530607'), BadRequestException);
  assert.equal(vaultCalls, 0);
  assert.equal(clientCalls, 0);
});
