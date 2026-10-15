import assert from 'node:assert/strict';
import test from 'node:test';
import { MetropolitanCoverageService } from '../src/municipal-parameters/metropolitan-coverage.service';
import { metropolitanRegion } from '../src/municipal-parameters/metropolitan-regions.registry';

function fixtureIbge(slug = 'sao-paulo') {
  const region = metropolitanRegion(slug)!;
  return region.municipalities.map((name, index) => ({ name, cityCode: String(3500000 + index).padStart(7, '0') }));
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    sourceUrl: 'https://www.gov.br/nfse/pt-br/municipios/monitoramento-adesoes',
    evidenceDate: '2026-09-24',
    effectiveFrom: null,
    confidence: 'medium',
    ...overrides,
  };
}

test('metropolitan coverage keeps national participation separate from direct public issuer capability', async () => {
  const ibgeRows = fixtureIbge();
  const ibge = { municipalitiesByState: async () => ibgeRows };
  const capabilities = {
    resolve: async (cityCode: string) => {
      const index = ibgeRows.findIndex((row) => row.cityCode === cityCode);
      if (index === 0) return { cityCode, environment: 'production', nationalStandard: true, nationalAdnParticipant: true, nationalPublicIssuer: true, route: 'national-direct', provider: 'nfse-national', source: 'official-national-parameters', checkedAt: '2026-09-24T00:00:00Z', ...evidence({ confidence: 'high' }) };
      if (index === 1) return { cityCode, environment: 'production', nationalStandard: true, nationalAdnParticipant: true, nationalPublicIssuer: false, route: 'unknown', provider: 'unknown', source: 'official-national-parameters', checkedAt: '2026-09-24T00:00:00Z', ...evidence() };
      if (index === 2) return { cityCode, environment: 'production', nationalStandard: true, nationalAdnParticipant: true, nationalPublicIssuer: false, route: 'municipal-provider', provider: 'giss', source: 'taxagent-observed-official-rejection', checkedAt: '2026-09-24T00:00:00Z', ...evidence({ sourceUrl: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional', confidence: 'high' }) };
      return { cityCode, environment: 'production', nationalStandard: false, nationalAdnParticipant: false, nationalPublicIssuer: false, route: 'unknown', provider: 'unknown', source: 'official-national-parameters', checkedAt: '2026-09-24T00:00:00Z', ...evidence({ confidence: 'medium' }) };
    },
  };

  const service = new MetropolitanCoverageService(ibge as any, capabilities as any);
  const result = await service.inspect('sao-paulo', 'production', 'regular', '2026-09-24');

  assert.equal(result.municipalities[0].classification, 'national-direct');
  assert.equal(result.municipalities[0].adn_participation, true);
  assert.equal(result.municipalities[0].confidence, 'high');
  assert.equal(result.municipalities[1].classification, 'participation-only');
  assert.equal(result.municipalities[1].adn_participation, true);
  assert.equal(result.municipalities[1].national_public_issuer, false);
  assert.equal(result.municipalities[2].classification, 'municipal-provider');
  assert.equal(result.counts['national-direct'], 1);
  assert.equal(result.counts['participation-only'], 1);
  assert.equal(result.counts['municipal-provider'], 1);
  assert.equal(result.counts.unknown, ibgeRows.length - 3);
});

test('metropolitan coverage fails closed per municipality when capability lookup fails', async () => {
  const ibgeRows = fixtureIbge('rio-de-janeiro');
  const ibge = { municipalitiesByState: async () => ibgeRows };
  const capabilities = { resolve: async () => { throw Object.assign(new Error('network'), { code: 'NFSE_PARAMETERS_NETWORK' }); } };
  const service = new MetropolitanCoverageService(ibge as any, capabilities as any);
  const result = await service.inspect('rio-de-janeiro', 'production', 'regular', '2026-09-24');

  assert.equal(result.counts.unknown, ibgeRows.length);
  assert.ok(result.municipalities.every((row) => row.classification === 'unknown'));
  assert.ok(result.municipalities.every((row) => row.adn_participation === false));
  assert.ok(result.municipalities.every((row) => row.national_public_issuer === false));
  assert.ok(result.municipalities.every((row) => row.confidence === 'low'));
});

test('metropolitan registry exposes the five initial commercial regions', () => {
  const service = new MetropolitanCoverageService({} as any, {} as any);
  assert.deepEqual(service.listRegions().map((row) => row.slug), ['sao-paulo', 'belo-horizonte', 'rio-de-janeiro', 'curitiba', 'porto-alegre']);
});
