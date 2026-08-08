import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMunicipalTaxGroup } from '../src/xml-engine/dps-builder.service';

test('builds mandatory municipal-tax structure for regular-regime live baseline', () => {
  assert.deepEqual(buildMunicipalTaxGroup({ description: 'Software', amount: 1000, issTaxation: '1', issWithholding: '1', issRate: 5 }, 'regular'), {
    tribMun: { tribISSQN: '1', tpRetISSQN: '1', pAliq: '5.00' },
    totTrib: { indTotTrib: 0 },
  });
});

test('refuses missing ISS fields and unsupported tax regimes', () => {
  assert.throws(() => buildMunicipalTaxGroup({ description: 'Software', amount: 1000 }, 'regular'), /ISS group requires/);
  assert.throws(() => buildMunicipalTaxGroup({ description: 'Software', amount: 1000, issTaxation: '1', issWithholding: '1' }, 'simples'), /supports tax_regime=regular only/);
});
