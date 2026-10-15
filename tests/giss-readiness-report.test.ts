import assert from 'node:assert/strict';
import test from 'node:test';
import { ReadinessService } from '../src/operations/readiness.service';

function serviceFor(municipalRegistration: string | null) {
  const tenancy = {
    getCompany: async () => ({
      id: 'comp_test',
      tax_id: '12345678000190',
      municipal_registration: municipalRegistration,
      city_code: '3548500',
      tax_regime: 'regular',
    }),
  };
  const vault = {
    metadata: async () => [{
      status: 'active',
      valid_to: '2027-09-21T15:41:00.000Z',
      certificate_fingerprint: 'fingerprint_test',
      subject_tax_id: '12345678000190',
    }],
  };
  const schemas = {
    active: () => ({ id: 'nfse-prodrest-v1.01-20260727', status: 'active' }),
    dpsConformance: () => ({ verified: true, reason: 'verified', attestation: { version: 1 } }),
    eventConformance: () => ({ verified: true, reason: 'verified', attestation: { version: 2 } }),
  };
  const capabilities = {
    resolve: async () => ({
      cityCode: '3548500',
      environment: 'test',
      nationalStandard: true,
      nationalPublicIssuer: false,
      route: 'municipal-provider',
      provider: 'giss',
      source: 'test',
      checkedAt: '2026-09-24T00:00:00.000Z',
    }),
  };
  return new ReadinessService(
    tenancy as any,
    vault as any,
    schemas as any,
    {} as any,
    capabilities as any,
    {} as any,
    {} as any,
  );
}

test('Santos readiness reports verified GISS reconciliation but blocks on missing IM and emission transport', async () => {
  const previousMode = process.env.TAXAGENT_NFSE_MODE;
  const previousLive = process.env.TAXAGENT_LIVE_ENABLED;
  process.env.TAXAGENT_NFSE_MODE = 'live';
  process.env.TAXAGENT_LIVE_ENABLED = 'true';
  try {
    const report = await serviceFor(null).report('comp_test', 'test');
    const byId = new Map(report.gates.map((gate) => [gate.id, gate]));

    assert.equal(byId.get('giss_reconciliation_contract')?.status, 'pass');
    assert.equal(byId.get('municipal_registration')?.status, 'fail');
    assert.equal(byId.get('municipal_registration')?.blocking, true);
    assert.equal(byId.get('giss_emission_transport')?.status, 'fail');
    assert.equal(byId.get('giss_emission_transport')?.blocking, true);
    assert.ok(report.failedBlockingGates.includes('municipal_registration'));
    assert.ok(report.failedBlockingGates.includes('giss_emission_transport'));
    assert.equal(report.failedBlockingGates.includes('giss_reconciliation_contract'), false);
    assert.equal(report.readyForTransmission, false);
  } finally {
    if (previousMode === undefined) delete process.env.TAXAGENT_NFSE_MODE; else process.env.TAXAGENT_NFSE_MODE = previousMode;
    if (previousLive === undefined) delete process.env.TAXAGENT_LIVE_ENABLED; else process.env.TAXAGENT_LIVE_ENABLED = previousLive;
  }
});

test('persisting the real IM clears only the IM blocker and does not unlock GISS emission', async () => {
  const previousMode = process.env.TAXAGENT_NFSE_MODE;
  const previousLive = process.env.TAXAGENT_LIVE_ENABLED;
  process.env.TAXAGENT_NFSE_MODE = 'live';
  process.env.TAXAGENT_LIVE_ENABLED = 'true';
  try {
    const report = await serviceFor('123456').report('comp_test', 'test');
    const byId = new Map(report.gates.map((gate) => [gate.id, gate]));

    assert.equal(byId.get('municipal_registration')?.status, 'pass');
    assert.equal(byId.get('giss_reconciliation_contract')?.status, 'pass');
    assert.equal(byId.get('giss_emission_transport')?.status, 'fail');
    assert.deepEqual(report.failedBlockingGates, ['giss_emission_transport']);
    assert.equal(report.readyForTransmission, false);
  } finally {
    if (previousMode === undefined) delete process.env.TAXAGENT_NFSE_MODE; else process.env.TAXAGENT_NFSE_MODE = previousMode;
    if (previousLive === undefined) delete process.env.TAXAGENT_LIVE_ENABLED; else process.env.TAXAGENT_LIVE_ENABLED = previousLive;
  }
});
