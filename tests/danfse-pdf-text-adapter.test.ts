import assert from 'node:assert/strict';
import test from 'node:test';
import PDFDocument from 'pdfkit';
import {
  DANFSE_PDF_TEXT_ADAPTER_VERSION,
  DanfsePdfTextError,
  extractDanfsePdfText,
} from '../src/danfse/danfse-pdf-text-adapter';

async function pdfWithPages(pages: string[]): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    for (const text of pages) {
      doc.addPage();
      doc.fontSize(12).text(text);
    }
    doc.end();
  });
}

test('PDF adapter extracts synthetic text in memory and reports page count', async () => {
  const pdf = await pdfWithPages([
    'CHAVE DE ACESSO DA NFS-E\n000123456789',
    'VALOR DA OPERAÇÃO / SERVIÇO\nR$ 1.000,00',
  ]);
  const result = await extractDanfsePdfText(pdf);
  assert.equal(result.adapterVersion, DANFSE_PDF_TEXT_ADAPTER_VERSION);
  assert.equal(result.pages, 2);
  assert.equal(result.text.includes('CHAVE DE ACESSO DA NFS-E'), true);
  assert.equal(result.text.includes('000123456789'), true);
  assert.equal(result.text.includes('VALOR DA OPERAÇÃO / SERVIÇO'), true);
});

test('PDF adapter fails closed on non-PDF input without echoing content', async () => {
  const secret = Buffer.from('TOKEN-SUPER-SECRETO');
  await assert.rejects(
    () => extractDanfsePdfText(secret),
    (error: unknown) => {
      assert.equal(error instanceof DanfsePdfTextError, true);
      assert.equal((error as DanfsePdfTextError).code, 'invalid_pdf');
      assert.equal(String(error).includes('TOKEN-SUPER-SECRETO'), false);
      return true;
    },
  );
});

test('PDF adapter rejects oversized input before parsing', async () => {
  const data = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(32)]);
  await assert.rejects(
    () => extractDanfsePdfText(data, { maxBytes: 16 }),
    (error: unknown) => error instanceof DanfsePdfTextError && error.code === 'too_large',
  );
});

test('PDF adapter maps corrupt PDF parser failures to a bounded code', async () => {
  const data = Buffer.from('%PDF-1.7\nnot-a-real-pdf\n%%EOF');
  await assert.rejects(
    () => extractDanfsePdfText(data),
    (error: unknown) => {
      assert.equal(error instanceof DanfsePdfTextError, true);
      assert.equal((error as DanfsePdfTextError).code, 'parse_failed');
      assert.equal(String(error).includes('not-a-real-pdf'), false);
      return true;
    },
  );
});

test('PDF adapter does not persist or transform source text beyond its in-memory return', async () => {
  const pdf = await pdfWithPages(['PII-CONTROLLED-FIXTURE']);
  const result = await extractDanfsePdfText(pdf);
  assert.equal(result.text.includes('PII-CONTROLLED-FIXTURE'), true);
  assert.deepEqual(Object.keys(result).sort(), ['adapterVersion', 'pages', 'text']);
});
