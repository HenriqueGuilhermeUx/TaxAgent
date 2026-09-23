import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { GissClient } from '../src/providers/giss/giss.client';

test('GISS WSDL probe refuses network access without client certificate material', async () => {
  const client = new GissClient();
  await assert.rejects(
    client.probe('3548500'),
    (error: unknown) => error instanceof FiscalEngineError
      && error.code === 'TA_GISS_CLIENT_CERTIFICATE_REQUIRED'
      && error.retryable === false,
  );
});
