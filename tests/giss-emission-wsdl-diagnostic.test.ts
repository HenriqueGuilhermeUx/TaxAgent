import assert from 'node:assert/strict';
import test from 'node:test';
import { GissWsdlDiagnosticService } from '../src/operations/giss-wsdl-diagnostic.service';

test('authenticated GISS WSDL diagnostic identifies RecepcionarLoteRps transport without fiscal POST', async () => {
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => ({ fingerprint: 'fp_test', tlsCertificatePem: 'SECRET_CERT', tlsPrivateKeyPem: 'SECRET_KEY' }) } as any,
    {
      inspectWsdl: async () => ({
        host: 'ws-homologacao-rtc.giss.com.br',
        path: '/service-ws/nf/nfse-ws',
        status: 200,
        reachable: true,
        bytes: 1234,
        sha256: 'abc',
        operations: ['ConsultarNfsePorRps', 'RecepcionarLoteRps'],
        soapActions: [
          'http://nfse.abrasf.org.br/ConsultarNfsePorRps',
          'http://nfse.abrasf.org.br/RecepcionarLoteRps',
        ],
        soapAddresses: ['https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws'],
        operationBindings: [
          { operation: 'ConsultarNfsePorRps', soapAction: 'http://nfse.abrasf.org.br/ConsultarNfsePorRps' },
          { operation: 'RecepcionarLoteRps', soapAction: 'http://nfse.abrasf.org.br/RecepcionarLoteRps' },
        ],
        requestWrappers: ['ConsultarNfsePorRpsRequest', 'RecepcionarLoteRpsRequest'],
        reconciliationSoapVersion: '1.1',
      }),
    } as any,
    { getCompany: async () => ({}) } as any,
  );

  const result = await service.inspect('comp_test', 'test', '3548500');
  assert.deepEqual(result.emission_transport, {
    operation: 'RecepcionarLoteRps',
    operation_present: true,
    transport_present: true,
    soap_address: 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws',
    soap_action: 'http://nfse.abrasf.org.br/RecepcionarLoteRps',
    soap_version: '1.1',
    request_wrapper_candidates: ['RecepcionarLoteRpsRequest'],
    wrapper_mapping_verified: false,
    fiscal_transmission_attempted: false,
    fiscal_emission_attempted: false,
  });
  assert.equal(result.network_method, 'GET');
  assert.equal(result.fiscal_transmission_attempted, false);
  assert.equal(result.certificate_private_material_exposed, false);
  assert.equal(JSON.stringify(result).includes('SECRET_CERT'), false);
  assert.equal(JSON.stringify(result).includes('SECRET_KEY'), false);
});

test('GISS emission transport diagnostic fails closed when WSDL does not prove emission binding', async () => {
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => ({ fingerprint: 'fp_test' }) } as any,
    {
      inspectWsdl: async () => ({
        operations: ['RecepcionarLoteRps'],
        soapAddresses: ['https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws'],
        operationBindings: [{ operation: 'RecepcionarLoteRps' }],
        requestWrappers: [],
        reconciliationSoapVersion: '1.1',
      }),
    } as any,
    { getCompany: async () => ({}) } as any,
  );

  const result = await service.inspect('comp_test', 'test', '3548500');
  assert.equal(result.emission_transport.operation_present, true);
  assert.equal(result.emission_transport.transport_present, false);
  assert.equal(result.emission_transport.wrapper_mapping_verified, false);
  assert.equal(result.fiscal_transmission_attempted, false);
});
