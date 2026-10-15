import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { GissReconciliationService } from '../src/providers/giss/giss-reconciliation.service';

test('GISS reconciliation gate blocks issuance before provider query is validated', async () => {
  const service = new GissReconciliationService({} as any);
  await assert.rejects(
    service.beforeIssue({ cityCode: '3548500', providerTaxId: '12345678000190', number: '1', series: 'TA' }),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_GISS_RECONCILIATION_REQUIRED' && error.retryable === false,
  );
});
