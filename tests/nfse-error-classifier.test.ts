import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyNfseRejection } from '../src/providers/nfse-national/nfse-error-classifier';

test('classifies official schema and certificate errors', () => {
  assert.deepEqual(classifyNfseRejection('E1235'), { category: 'schema', retryable: false });
  assert.deepEqual(classifyNfseRejection('E1200'), { category: 'transmission-certificate', retryable: false });
  assert.deepEqual(classifyNfseRejection('E1225'), { category: 'compression', retryable: false });
});

test('treats unknown E codes as terminal business rules', () => {
  assert.deepEqual(classifyNfseRejection('E9999'), { category: 'business-rule', retryable: false });
});
