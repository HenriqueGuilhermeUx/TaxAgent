import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDatabaseConnectionString } from '../src/database/database.service';

test('database URL upgrades require to verify-full', () => {
  const normalized = normalizeDatabaseConnectionString('postgresql://user:pass@example.com:5432/db?sslmode=require');
  assert.match(normalized, /sslmode=verify-full/);
});

test('database URL upgrades prefer and verify-ca to verify-full', () => {
  assert.match(normalizeDatabaseConnectionString('postgresql://u:p@example.com/db?sslmode=prefer'), /sslmode=verify-full/);
  assert.match(normalizeDatabaseConnectionString('postgresql://u:p@example.com/db?sslmode=verify-ca'), /sslmode=verify-full/);
});

test('database URL preserves explicit verify-full and disable modes', () => {
  assert.match(normalizeDatabaseConnectionString('postgresql://u:p@example.com/db?sslmode=verify-full'), /sslmode=verify-full/);
  assert.match(normalizeDatabaseConnectionString('postgresql://u:p@example.com/db?sslmode=disable'), /sslmode=disable/);
});

test('database URL leaves non-URL connection strings untouched', () => {
  assert.equal(normalizeDatabaseConnectionString('host=localhost dbname=taxagent'), 'host=localhost dbname=taxagent');
});
