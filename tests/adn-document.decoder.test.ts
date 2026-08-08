import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { decodeAdnDocument, extractAdnEntries } from '../src/inbox/adn-document.decoder';

test('extracts LoteDFe arrays and decodes gzip+base64 XML', () => {
  const xml = '<NFSe Id="1"><x>ok</x></NFSe>';
  const payload = { StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS', LoteDFe: [{ NSU: 42, ChaveAcesso: 'ABC', TipoDocumento: 'NFSE', ArquivoXml: gzipSync(Buffer.from(xml)).toString('base64') }] };
  const entries = extractAdnEntries(payload);
  assert.equal(entries.length, 1);
  const decoded = decodeAdnDocument(entries[0]);
  assert.equal(decoded?.nsu, '42');
  assert.equal(decoded?.accessKey, 'ABC');
  assert.equal(decoded?.content?.toString('utf8'), xml);
  assert.equal(decoded?.contentType, 'application/xml');
});

test('preserves already-decoded XML and ignores records without NSU', () => {
  const decoded = decodeAdnDocument({ NSU: '0007', ArquivoXml: '<evento />', TipoEvento: '101101' });
  assert.equal(decoded?.nsu, '0007');
  assert.equal(decoded?.content?.toString(), '<evento />');
  assert.equal(decodeAdnDocument({ ArquivoXml: '<x />' }), null);
});

test('supports object-shaped LoteDFe containers', () => {
  assert.equal(extractAdnEntries({ LoteDFe: { DFe: [{ NSU: 1 }, { NSU: 2 }] } }).length, 2);
});
