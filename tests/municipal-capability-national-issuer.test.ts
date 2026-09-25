import assert from 'node:assert/strict';
import test from 'node:test';
import { MunicipalCapabilityService } from '../src/municipal-parameters/municipal-capability.service';

function serviceFor(payload: unknown, supported = true) {
  const db = {
    query: async (sql: string) => {
      if (sql.includes('SELECT supported')) return { rows: [] };
      return { rows: [] };
    },
  };
  const client = {
    getConvention: async () => ({ supported, payload }),
  };
  return new MunicipalCapabilityService(db as any, client as any);
}

test('official aderenteEmissorNacional=1 unlocks national-direct and proves ADN participation', async () => {
  const result = await serviceFor({ parametrosConvenio: { aderenteAmbienteNacional: 1, aderenteEmissorNacional: 1 } }).resolve('3550308', 'test');
  assert.equal(result.nationalAdnParticipant, true);
  assert.equal(result.nationalPublicIssuer, true);
  assert.equal(result.route, 'national-direct');
  assert.equal(result.provider, 'nfse-national');
  assert.equal(result.confidence, 'high');
  assert.ok(result.sourceUrl?.includes('gov.br/nfse'));
});

test('official aderenteEmissorNacional=0 keeps ADN participation separate from direct public issuer', async () => {
  const result = await serviceFor({ parametrosConvenio: { aderenteAmbienteNacional: 1, aderenteEmissorNacional: 0 } }).resolve('3304557', 'test');
  assert.equal(result.nationalStandard, true);
  assert.equal(result.nationalAdnParticipant, true);
  assert.equal(result.nationalPublicIssuer, false);
  assert.equal(result.route, 'unknown');
  assert.equal(result.provider, 'unknown');
  assert.equal(result.confidence, 'medium');
});

test('free text mentioning public issuer never unlocks national-direct without the exact structured flag', async () => {
  const result = await serviceFor({ message: 'Emissor Publico habilitado true', parametrosConvenio: { aderenteAmbienteNacional: 1 } }).resolve('3106200', 'test');
  assert.equal(result.nationalAdnParticipant, true);
  assert.equal(result.nationalPublicIssuer, false);
  assert.equal(result.route, 'unknown');
});

test('public issuer flag implies national ecosystem participation even if ADN flag is omitted', async () => {
  const result = await serviceFor({ parametrosConvenio: { aderenteEmissorNacional: 1 } }).resolve('4106902', 'test');
  assert.equal(result.nationalAdnParticipant, true);
  assert.equal(result.nationalPublicIssuer, true);
  assert.equal(result.route, 'national-direct');
});
