import assert from 'node:assert/strict';
import test from 'node:test';
import { NativeDocumentExtractorService } from '../src/document-intake/native-document-extractor.service';

const service = new NativeDocumentExtractorService();

test('NFS-e XML becomes an authoritative canonical fiscal document', async () => {
  const xml = `<?xml version="1.0"?><NFSe><infNFSe><nNFSe>12345</nNFSe><dhEmi>2026-09-10T20:00:00-03:00</dhEmi><prest><CNPJ>12345678000199</CNPJ></prest><vServ>1500.25</vServ></infNFSe></NFSe>`;
  const result = (await service.extract({ source_type: 'xml', content: xml, document_type: 'auto' })).canonical;

  assert.equal(result.document_type, 'nfse');
  assert.equal(result.authority, 'fiscal_xml');
  assert.equal(result.confidence, 1);
  assert.equal(result.supplier.tax_id, '12345678000199');
  assert.equal(result.document_number, '12345');
  assert.deepEqual(result.total, { amount: 1500.25, currency: 'BRL' });
  assert.deepEqual(result.missing, []);
  assert.equal(result.lineage?.provider, 'native');
  assert.equal(result.lineage?.authoritative, true);
  assert.match(result.raw.sha256, /^[a-f0-9]{64}$/);
});

test('plain text never becomes authoritative or posts fiscal effects implicitly', async () => {
  const result = (await service.extract({ source_type: 'text', content: 'Recibo de R$ 500 para serviço de consultoria.' })).canonical;

  assert.equal(result.document_type, 'unknown');
  assert.equal(result.authority, 'unverified_text');
  assert.equal(result.confidence, 0);
  assert.equal(result.lineage?.authoritative, false);
  assert.ok(result.missing.includes('verified_fiscal_source'));
  assert.ok(result.warnings.some((warning) => warning.includes('must not create fiscal or ledger effects automatically')));
});

test('unknown XML stays explicit instead of being silently classified as NFS-e', async () => {
  const result = (await service.extract({ source_type: 'xml', content: '<document><value>10</value></document>' })).canonical;
  assert.equal(result.document_type, 'unknown');
  assert.equal(result.authority, 'fiscal_xml');
  assert.equal(result.lineage?.authoritative, false);
  assert.ok(result.warnings.length > 0);
});
