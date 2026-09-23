import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { GissWsdlDiagnosticService } from '../src/operations/giss-wsdl-diagnostic.service';

test('GISS WSDL diagnostic is test-only and does not touch certificate/network in production', async () => {
  let vaultCalls = 0;
  let clientCalls = 0;
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => { vaultCalls += 1; return {} as any; } } as any,
    { inspectWsdl: async () => { clientCalls += 1; return {} as any; } } as any,
  );
  await assert.rejects(service.inspect('comp_1', 'production', '3548500'), BadRequestException);
  assert.equal(vaultCalls, 0);
  assert.equal(clientCalls, 0);
});

test('GISS WSDL diagnostic exposes contract metadata without returning certificate material', async () => {
  const service = new GissWsdlDiagnosticService(
    { getActiveMaterial: async () => ({ fingerprint: 'fp_test', tlsCertificatePem: 'SECRET_CERT', tlsPrivateKeyPem: 'SECRET_KEY' }) } as any,
    { inspectWsdl: async () => ({ host: 'ws-homologacao.giss.com.br', path: '/service-ws/nf/nfse-ws', status: 200, reachable: true, bytes: 1234, sha256: 'abc', operations: ['ConsultarNfsePorRps'], soapActions: ['action'] }) } as any,
  );
  const result = await service.inspect('comp_1', 'test', '3548500');
  assert.equal(result.certificate_fingerprint, 'fp_test');
  assert.equal(result.fiscal_transmission_attempted, false);
  assert.equal(result.network_method, 'GET');
  assert.equal(JSON.stringify(result).includes('SECRET_CERT'), false);
  assert.equal(JSON.stringify(result).includes('SECRET_KEY'), false);
});
