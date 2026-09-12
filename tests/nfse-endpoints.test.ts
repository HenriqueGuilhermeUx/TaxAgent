import assert from 'node:assert/strict';
import test from 'node:test';
import { nfseEndpointPolicy, resolveNfseBase } from '../src/providers/nfse-national/nfse-endpoints';

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
    fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
}

test('accepts the official Produção Restrita SEFIN endpoint', () => {
  withEnv({ NFSE_TEST_BASE_URL: 'https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional', TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS: 'false' }, () => {
    assert.equal(nfseEndpointPolicy('test').official, true);
    assert.match(resolveNfseBase('test'), /^https:\/\/sefin\.producaorestrita\.nfse\.gov\.br\/API\/SefinNacional\/?$/);
  });
});

test('refuses to present A1 to an untrusted endpoint by default', () => {
  withEnv({ NFSE_TEST_BASE_URL: 'https://example.test/SefinNacional', TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS: 'false' }, () => {
    assert.throws(() => resolveNfseBase('test'), /Refusing to present a private A1 certificate/);
  });
});

test('custom endpoint requires an explicit opt-in', () => {
  withEnv({ NFSE_TEST_BASE_URL: 'https://nfse.private.example/SefinNacional', TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS: 'true' }, () => {
    assert.equal(resolveNfseBase('test'), 'https://nfse.private.example/SefinNacional/');
  });
});
