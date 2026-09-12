import assert from 'node:assert/strict';
import test from 'node:test';
import { DocStructExtractorService } from '../src/document-intake/docstruct-extractor.service';

test('DocStruct maps extracted text into non-authoritative canonical data', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    assert.equal(body.type, 'invoice');
    assert.equal(body.output, 'json');
    return new Response(JSON.stringify({
      ok: true,
      data: {
        vendor: { name: 'Fornecedor Exemplo', cnpj: '12.345.678/0001-99' },
        number: 'NF-42',
        date: '2026-09-10',
        total: 'R$ 1.234,56',
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const result = await new DocStructExtractorService().extract({ source_type: 'text', content: 'nota fiscal exemplo', document_type: 'invoice' });
    assert.equal(result.provider, 'docstruct');
    assert.equal(result.canonical.authority, 'unverified_text');
    assert.equal(result.canonical.lineage?.authoritative, false);
    assert.equal(result.canonical.supplier.tax_id, '12345678000199');
    assert.equal(result.canonical.document_number, 'NF-42');
    assert.deepEqual(result.canonical.total, { amount: 1234.56, currency: 'BRL' });
    assert.ok(result.canonical.missing.includes('verified_fiscal_source'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('DocStruct does not turn a missing total into zero', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, data: { number: '1' } }), { status: 200 })) as typeof fetch;
  try {
    const result = await new DocStructExtractorService().extract({ source_type: 'text', content: 'sem valor' });
    assert.equal(result.canonical.total, undefined);
    assert.ok(result.canonical.missing.includes('total_amount'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
