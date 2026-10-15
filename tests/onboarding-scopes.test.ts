import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { TAXAGENT_SCOPES } from '../src/auth/require-scope.decorator';
import { FiscalOnboardingController } from '../src/operations/fiscal-onboarding.controller';

function scopes(method: keyof FiscalOnboardingController): string[] {
  return Reflect.getMetadata(TAXAGENT_SCOPES, FiscalOnboardingController.prototype[method]) ?? [];
}

test('onboarding reads remain operations:read while evidence-producing POSTs require operations:write', () => {
  assert.deepEqual(scopes('inspect'), ['operations:read']);
  assert.deepEqual(scopes('pilotStatus'), ['operations:read']);
  assert.deepEqual(scopes('history'), ['operations:read']);
  assert.deepEqual(scopes('pilotRun'), ['operations:write']);
  assert.deepEqual(scopes('assess'), ['operations:write']);
  assert.deepEqual(scopes('runPreflight'), ['operations:write']);
});
