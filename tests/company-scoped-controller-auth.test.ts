import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { CertificatesController } from '../src/certificates/certificates.controller';
import { CustomerFiscalController } from '../src/customer-portal/customer-fiscal.controller';
import { FiscalOnboardingController } from '../src/operations/fiscal-onboarding.controller';
import { ProviderCredentialsController } from '../src/provider-credentials/provider-credentials.controller';
import { TaxAgentAuthContext } from '../src/auth/auth.types';

const testAuth: TaxAgentAuthContext = {
  keyId: 'key_test',
  companyId: 'cmp_1',
  environment: 'test',
  scopes: ['*'],
};

function missingAuth(error: unknown) {
  return error instanceof ForbiddenException && error.message === 'API key authentication is required';
}

test('company-scoped fiscal controllers fail closed when authenticated context is missing', () => {
  const customer = new CustomerFiscalController({} as any);
  const onboarding = new FiscalOnboardingController({} as any, {} as any, {} as any, {} as any);
  const certificates = new CertificatesController({} as any);
  const credentials = new ProviderCredentialsController({} as any);

  assert.throws(() => customer.proof('cmp_1', 'test', undefined, undefined), missingAuth);
  assert.throws(() => onboarding.inspect('cmp_1', 'test', undefined, undefined), missingAuth);
  assert.throws(() => certificates.list('cmp_1', undefined), missingAuth);
  assert.throws(() => credentials.list('cmp_1', undefined), missingAuth);
});

test('provider credential routes reject cross-environment writes', () => {
  const credentials = new ProviderCredentialsController({} as any);

  assert.throws(
    () => credentials.store('cmp_1', {
      provider: 'giss',
      environment: 'production',
      credentials: { login: 'x' },
    }, testAuth),
    (error: unknown) => error instanceof ForbiddenException
      && error.message === 'API key environment does not match requested environment',
  );

  assert.throws(
    () => credentials.disable('cmp_1', 'giss', 'production', testAuth),
    (error: unknown) => error instanceof ForbiddenException
      && error.message === 'API key environment does not match requested environment',
  );
});

test('provider credential metadata listing is bound to the API key environment', async () => {
  let called: [string, string] | null = null;
  const credentials = new ProviderCredentialsController({
    list: async (companyId: string, environment: string) => {
      called = [companyId, environment];
      return [];
    },
  } as any);

  await credentials.list('cmp_1', testAuth);
  assert.deepEqual(called, ['cmp_1', 'test']);
});
