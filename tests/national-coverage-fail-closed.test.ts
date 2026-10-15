import assert from 'node:assert/strict';
import test from 'node:test';
import { NationalCoverageService } from '../src/municipal-parameters/national-coverage.service';

test('national coverage never claims Santos municipal GISS route', async () => {
  const service = new NationalCoverageService({
    resolve: async () => ({ route: 'municipal-provider', provider: 'giss', nationalPublicIssuer: false }),
  } as any);
  assert.equal(await service.supports('3548500', 'test', { taxRegime: 'regular', effectiveAt: '2026-09-23' }), false);
});

test('national coverage fails closed when participation exists but public national issuer is unproven', async () => {
  const service = new NationalCoverageService({
    resolve: async () => ({ route: 'unknown', provider: 'unknown', nationalPublicIssuer: false }),
  } as any);
  assert.equal(await service.supports('3550308', 'test'), false);
});

test('national coverage accepts only proven national-direct public issuer route', async () => {
  let received: unknown;
  const service = new NationalCoverageService({
    resolve: async (_city: string, _environment: string, taxpayer: unknown) => {
      received = taxpayer;
      return { route: 'national-direct', provider: 'nfse-national', nationalPublicIssuer: true };
    },
  } as any);
  assert.equal(await service.supports('3530607', 'test', { taxRegime: 'simples_nacional', effectiveAt: '2026-11-01' }), true);
  assert.deepEqual(received, { taxRegime: 'simples_nacional', effectiveAt: '2026-11-01' });
});
