import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyGissReconciliation } from '../src/providers/giss/giss-reconciliation-classifier';

test('authorized reconciliation returns existing NFS-e and prevents reissue path', () => {
  const result = classifyGissReconciliation({ authorized: true, nfseNumber: '42', verificationCode: 'ABC', raw: '<xml/>' });
  assert.equal(result.state, 'authorized');
  if (result.state === 'authorized') assert.equal(result.nfseNumber, '42');
});

test('provider error is unknown by default and never treated as RPS absence', () => {
  const result = classifyGissReconciliation({ authorized: false, errorCode: 'E999', errorMessage: 'Nao encontrado', raw: '<xml/>' });
  assert.equal(result.state, 'unknown');
});

test('not_found is allowed only for an explicitly verified provider code', () => {
  const result = classifyGissReconciliation(
    { authorized: false, errorCode: 'VERIFIED_NOT_FOUND', errorMessage: 'Nao encontrado', raw: '<xml/>' },
    ['VERIFIED_NOT_FOUND'],
  );
  assert.deepEqual(result, { state: 'not_found', code: 'VERIFIED_NOT_FOUND' });
});
