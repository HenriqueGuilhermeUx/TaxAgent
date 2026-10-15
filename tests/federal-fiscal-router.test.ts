import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { FederalFiscalRouterService } from '../src/federal-fiscal/federal-fiscal-router.service';

test('federal fiscal router fails closed when no verified provider exists', async () => {
  const router = new FederalFiscalRouterService([]);
  await assert.rejects(
    router.resolve('tax_status'),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_FEDERAL_FISCAL_PROVIDER_REQUIRED' && error.retryable === false,
  );
});

test('federal fiscal router selects a provider only when capability is explicitly supported', async () => {
  const provider = {
    name: 'verified-test-provider',
    canHandle: async (capability: string) => capability === 'simples',
    execute: async (request: any) => ({ provider: 'verified-test-provider', capability: request.capability, operation: request.operation, status: 'completed' as const }),
  };
  const router = new FederalFiscalRouterService([provider]);
  assert.equal((await router.resolve('simples')).name, 'verified-test-provider');
  await assert.rejects(router.resolve('dctfweb'));
});
