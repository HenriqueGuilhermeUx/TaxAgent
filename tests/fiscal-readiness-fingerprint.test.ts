import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalReadinessFingerprintService, readinessFingerprintSha256 } from '../src/operations/fiscal-readiness-fingerprint.service';

function state(overrides: Record<string, unknown> = {}) {
  return {
    company: {
      id: 'comp_1',
      tax_id: '12345678000190',
      city_code: '3548500',
      municipal_registration: '123456',
      tax_regime: 'regular',
    },
    environment: 'test' as const,
    route: 'municipal-provider',
    provider: 'giss',
    certificate: {
      id: 'cert_1',
      status: 'active',
      certificate_fingerprint: 'a'.repeat(64),
      serial_number: '01',
      subject_tax_id: '12345678000190',
      valid_to: '2027-12-31T23:59:59.000Z',
    },
    provider_credentials: {
      id: 'cred_1',
      provider: 'giss',
      environment: 'test' as const,
      credential_keys: ['password', 'login'],
      status: 'verified',
      verified_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    },
    ...overrides,
  } as any;
}

test('readiness fingerprint is deterministic and normalizes credential key order', () => {
  const first = readinessFingerprintSha256(state());
  const second = readinessFingerprintSha256(state({
    provider_credentials: {
      ...state().provider_credentials,
      credential_keys: ['login', 'password'],
    },
  }));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});

test('replacing A1 metadata changes readiness fingerprint', () => {
  const first = readinessFingerprintSha256(state());
  const second = readinessFingerprintSha256(state({
    certificate: { ...state().certificate, id: 'cert_2', certificate_fingerprint: 'b'.repeat(64) },
  }));
  assert.notEqual(first, second);
});

test('changing provider credential metadata changes readiness fingerprint', () => {
  const first = readinessFingerprintSha256(state());
  const second = readinessFingerprintSha256(state({
    provider_credentials: { ...state().provider_credentials, updated_at: '2026-10-15T00:00:00.000Z' },
  }));
  assert.notEqual(first, second);
});

test('fingerprint service queries metadata only and never selects encrypted secret material', async () => {
  const sql: string[] = [];
  const db = {
    query: async (statement: string) => {
      sql.push(statement);
      if (statement.includes('FROM companies')) return { rows: [state().company] };
      if (statement.includes('FROM certificates')) return { rows: [state().certificate] };
      if (statement.includes('FROM fiscal_provider_credentials')) return { rows: [state().provider_credentials] };
      return { rows: [] };
    },
  };
  const service = new FiscalReadinessFingerprintService(db as any);
  const fingerprint = await service.compute('comp_1', 'test', 'municipal-provider', 'giss');
  assert.match(fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(sql.join('\n'), /encrypted_pfx|encrypted_password|encrypted_credentials/i);
});
