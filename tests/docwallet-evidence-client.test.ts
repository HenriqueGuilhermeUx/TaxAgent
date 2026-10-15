import assert from 'node:assert/strict';
import test from 'node:test';
import { DocWalletEvidenceClient } from '../src/evidence/docwallet-evidence.client';

test('DocWallet evidence client uses dedicated server credential and never puts it in URL/body', async () => {
  const previous = {
    enabled: process.env.TAXAGENT_DOCWALLET_EVIDENCE_ENABLED,
    base: process.env.DOCWALLET_BASE_URL,
    key: process.env.DOCWALLET_TAXAGENT_SERVICE_KEY,
  };
  process.env.TAXAGENT_DOCWALLET_EVIDENCE_ENABLED = 'true';
  process.env.DOCWALLET_BASE_URL = 'https://docwallet.example.test';
  process.env.DOCWALLET_TAXAGENT_SERVICE_KEY = 'server-only-key';
  const originalFetch = globalThis.fetch;
  let captured: any = null;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured = { url: String(url), init };
    return new Response(JSON.stringify({ success: true, status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const client = new DocWalletEvidenceClient();
    assert.equal(client.configured(), true);
    await client.provision('comp_1', 'Empresa 1');
    assert.equal(captured.init.headers['x-taxagent-key'], 'server-only-key');
    assert.doesNotMatch(captured.url, /server-only-key/);
    assert.doesNotMatch(String(captured.init.body), /server-only-key/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previous.enabled === undefined) delete process.env.TAXAGENT_DOCWALLET_EVIDENCE_ENABLED; else process.env.TAXAGENT_DOCWALLET_EVIDENCE_ENABLED = previous.enabled;
    if (previous.base === undefined) delete process.env.DOCWALLET_BASE_URL; else process.env.DOCWALLET_BASE_URL = previous.base;
    if (previous.key === undefined) delete process.env.DOCWALLET_TAXAGENT_SERVICE_KEY; else process.env.DOCWALLET_TAXAGENT_SERVICE_KEY = previous.key;
  }
});
