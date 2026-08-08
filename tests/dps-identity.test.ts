import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDpsId, normalizeTaxIdentity } from '../src/xml-engine/dps-builder.service';

test('builds official DPS identity for a CNPJ prestador', () => {
  const id = buildDpsId('3550308', '12.345.678/0001-90', '1', 42);
  assert.equal(id, 'DPS355030821234567800019000001000000000000042');
  assert.equal(id.length, 45);
});

test('pads CPF to 14 positions and uses inscription type 1', () => {
  const identity = normalizeTaxIdentity('123.456.789-01');
  assert.deepEqual(identity, { kind: 'CPF', xmlValue: '12345678901', typeCode: '1', idValue: '00012345678901' });
  assert.equal(buildDpsId('3550308', '12345678901', '900', 7), 'DPS355030810001234567890109000000000000000007');
});

test('preserves 14-position alphanumeric CNPJ in DPS identity', () => {
  const id = buildDpsId('3550308', 'AB345678000190', 'A1', 9);
  assert.equal(id, 'DPS35503082AB345678000190000A1000000000000009');
  assert.equal(id.length, 45);
});
