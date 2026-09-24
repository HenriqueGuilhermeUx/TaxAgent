import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { NfseNationalClient } from '../src/providers/nfse-national/nfse-national.client';

const accessKey = '35306072200000000000000000000000000126090000000000';
const certificate = {} as any;

test('national event reconciliation queries the exact SEFIN event type and sequence resource', async () => {
  const client = new NfseNationalClient();
  let capturedUrl = '';
  let capturedMethod = '';
  (client as any).requestJson = async (url: URL, method: string) => {
    capturedUrl = url.toString();
    capturedMethod = method;
    return { eventoXmlGZipB64: 'stub' };
  };

  await client.getEventByTypeAndSequence('test', accessKey, '101101', 1, certificate);

  const url = new URL(capturedUrl);
  assert.equal(capturedMethod, 'GET');
  assert.match(url.pathname, new RegExp(`/nfse/${accessKey}/eventos/101101/1$`));
  assert.equal(url.hostname, 'sefin.producaorestrita.nfse.gov.br');
});

test('event reconciliation converts only NFSE_NOT_FOUND into explicit absence', async () => {
  const client = new NfseNationalClient();
  (client as any).requestJson = async () => { throw new FiscalEngineError('NFSE_NOT_FOUND', 'not found', false); };
  const result = await client.findEventByTypeAndSequence('test', accessKey, '101101', 1, certificate);
  assert.equal(result, null);
});

test('event reconciliation preserves transient provider failures instead of treating them as absence', async () => {
  const client = new NfseNationalClient();
  (client as any).requestJson = async () => { throw new FiscalEngineError('NFSE_TRANSIENT_HTTP', 'provider unavailable', true); };
  await assert.rejects(
    () => client.findEventByTypeAndSequence('test', accessKey, '101101', 1, certificate),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'NFSE_TRANSIENT_HTTP' && error.retryable,
  );
});

test('event reconciliation rejects malformed event identity before building a provider URL', async () => {
  const client = new NfseNationalClient();
  await assert.rejects(
    () => client.getEventByTypeAndSequence('test', accessKey, '1011', 0, certificate),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_NFSE_EVENT_QUERY_INVALID',
  );
});
