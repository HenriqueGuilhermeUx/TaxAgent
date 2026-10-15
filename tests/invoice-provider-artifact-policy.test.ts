import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { InvoicesService } from '../src/invoices/invoices.service';

const service = () => new InvoicesService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
const policy = (instance: InvoicesService, provider: string, prepared: boolean, engine = false) => (instance as any).assertProviderArtifactPolicy(provider, prepared, engine);

test('municipal GISS live route does not require a national Prepared DPS', () => {
  assert.doesNotThrow(() => policy(service(), 'giss', false));
});

test('national-direct live route still requires a Prepared DPS before persistence', () => {
  assert.throws(() => policy(service(), 'nfse-national', false), BadRequestException);
});

test('municipal provider rejects an accidentally bound national Prepared DPS', () => {
  assert.throws(() => policy(service(), 'giss', true), BadRequestException);
});

test('worker fails closed with stable engine codes for artifact/provider mismatch', () => {
  assert.throws(
    () => policy(service(), 'nfse-national', false, true),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_PREPARED_DPS_REQUIRED' && error.retryable === false,
  );
  assert.throws(
    () => policy(service(), 'giss', true, true),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_PREPARED_DPS_PROVIDER_MISMATCH' && error.retryable === false,
  );
});
