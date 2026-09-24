import assert from 'node:assert/strict';
import test from 'node:test';
import { GatewayCapabilityService } from '../src/municipal-parameters/gateway-capability.service';

test('gateway capability reports required municipal credentials without exposing API key', async () => {
  const plugnotas = {
    isConfigured: () => true,
    getMunicipality: async () => ({
      id: 3548500,
      nome: 'Santos',
      uf: 'SP',
      padrao: 'GISS',
      certificado: true,
      login: true,
      senha: true,
      upload: true,
      sequencial: true,
      substituicao: false,
      padraoNacional: { producao: false, homologacao: false },
    }),
  };
  const result = await new GatewayCapabilityService(plugnotas as any).resolve('3548500', 'test');
  assert.equal(result.covered, true);
  assert.equal(result.transmissionEnabled, false);
  assert.deepEqual(result.requirements, {
    certificate: true,
    login: true,
    password: true,
    certificateUpload: true,
    sequentialNumbering: true,
    substitution: false,
  });
  assert.equal(JSON.stringify(result).includes('api-key'), false);
});

test('gateway capability fails closed when gateway is not configured', async () => {
  const plugnotas = { isConfigured: () => false };
  const result = await new GatewayCapabilityService(plugnotas as any).resolve('3550308', 'test');
  assert.equal(result.configured, false);
  assert.equal(result.covered, false);
  assert.equal(result.transmissionEnabled, false);
});
