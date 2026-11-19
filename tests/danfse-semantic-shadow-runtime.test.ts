import assert from 'node:assert/strict';
import test from 'node:test';
import PDFDocument from 'pdfkit';
import { DanfseService } from '../src/danfse/danfse.service';
import { DanfseModel } from '../src/danfse/danfse.types';

async function pdf(text: string): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ compress: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(10).text(text);
    doc.end();
  });
}

function model(): DanfseModel {
  return {
    specVersion: 'NT008-1.02',
    environment: 'test',
    accessKey: '00012345678901234567890123456789012345678901234567',
    number: '000000123',
    provider: { taxId: '12.345.678/0001-90' },
    customer: {},
    recipient: {},
    intermediary: {},
    service: {},
    iss: {},
    federal: {},
    ibsCbs: {},
    totals: { service: '1000.00' },
  };
}

function semanticText(providerTaxId = '12.345.678/0001-90'): string {
  return [
    'NFS-e SEM VALIDADE JURÍDICA',
    'CHAVE DE ACESSO DA NFS-E',
    '00012345678901234567890123456789012345678901234567',
    'NÚMERO DA NFS-E',
    '000000123',
    'PRESTADOR / FORNECEDOR',
    'CNPJ / CPF / NIF',
    providerTaxId,
    'VALOR TOTAL DA NFS-E',
    'VALOR DA OPERAÇÃO / SERVIÇO',
    'R$ 1.000,00',
  ].join('\n');
}

async function exercise(officialPdf: Buffer, localPdf: Buffer, environment: 'test' | 'production' = 'test') {
  const beforeRtc = process.env.TAXAGENT_RTC_ENGINE_MODE;
  const beforeSemantic = process.env.TAXAGENT_DANFSE_SEMANTIC_SHADOW_ENABLED;
  const beforeRenderer = process.env.TAXAGENT_DANFSE_RENDERER_MODE;
  process.env.TAXAGENT_RTC_ENGINE_MODE = 'shadow';
  process.env.TAXAGENT_DANFSE_SEMANTIC_SHADOW_ENABLED = 'true';
  process.env.TAXAGENT_DANFSE_RENDERER_MODE = 'verified';

  let saved: any;
  const calls: string[] = [];
  const service = new DanfseService(
    { query: async () => ({ rows: [{ company_id: 'company', status: 'authorized', environment }] }) } as any,
    {
      latestContent: async () => ({ content: Buffer.from('<NFSe/>'), sha256: 'xml-sha' }),
      save: async (value: any) => { saved = value; return value; },
    } as any,
    { parse: () => model() } as any,
    { render: async () => { calls.push('local'); return localPdf; } } as any,
    {
      danfseConfigured: () => true,
      renderDanfse: async () => { calls.push('official'); return officialPdf; },
    } as any,
  );

  try {
    await service.generate('invoice');
    return { saved, calls };
  } finally {
    if (beforeRtc === undefined) delete process.env.TAXAGENT_RTC_ENGINE_MODE;
    else process.env.TAXAGENT_RTC_ENGINE_MODE = beforeRtc;
    if (beforeSemantic === undefined) delete process.env.TAXAGENT_DANFSE_SEMANTIC_SHADOW_ENABLED;
    else process.env.TAXAGENT_DANFSE_SEMANTIC_SHADOW_ENABLED = beforeSemantic;
    if (beforeRenderer === undefined) delete process.env.TAXAGENT_DANFSE_RENDERER_MODE;
    else process.env.TAXAGENT_DANFSE_RENDERER_MODE = beforeRenderer;
  }
}

test('semantic shadow marks matched_fields only when official and local PDFs independently match XML', async () => {
  const official = await pdf(semanticText());
  const local = await pdf(semanticText());
  const { saved, calls } = await exercise(official, local);

  assert.deepEqual(calls, ['official', 'local']);
  assert.equal(saved.metadata.official_shadow.semantic_assessment, 'matched_fields');
  assert.equal(saved.metadata.official_shadow.semantic.official.state, 'matched_fields');
  assert.equal(saved.metadata.official_shadow.semantic.local.state, 'matched_fields');
  assert.equal(saved.metadata.official_shadow.semantic.official.authoritative, false);
  assert.equal(saved.metadata.official_shadow.semantic.local.authoritative, false);
  assert.equal(saved.metadata.official_shadow.semantic.official.visual_conformance, 'not_assessed');
  assert.deepEqual(saved.metadata.official_shadow.semantic.official.findings, []);

  const metadata = JSON.stringify(saved.metadata);
  assert.equal(metadata.includes('00012345678901234567890123456789012345678901234567'), false);
  assert.equal(metadata.includes('12.345.678/0001-90'), false);
  assert.equal(metadata.includes('R$ 1.000,00'), false);
});

test('semantic shadow reports different when local PDF conflicts with authorized XML even if official matches', async () => {
  const official = await pdf(semanticText());
  const local = await pdf(semanticText('11.111.111/0001-11'));
  const { saved } = await exercise(official, local);

  assert.equal(saved.metadata.official_shadow.semantic_assessment, 'different');
  assert.equal(saved.metadata.official_shadow.semantic.official.state, 'matched_fields');
  assert.equal(saved.metadata.official_shadow.semantic.local.state, 'different');
  assert.deepEqual(saved.metadata.official_shadow.semantic.local.findings, [
    { field: 'provider.tax_id', code: 'different' },
  ]);

  const metadata = JSON.stringify(saved.metadata);
  assert.equal(metadata.includes('11.111.111/0001-11'), false);
  assert.equal(metadata.includes('12.345.678/0001-90'), false);
});

test('semantic shadow is inconclusive when one PDF cannot be extracted', async () => {
  const official = await pdf(semanticText());
  const corruptLocal = Buffer.from('%PDF-1.7\ncorrupt\n%%EOF');
  const { saved } = await exercise(official, corruptLocal);

  assert.equal(saved.metadata.official_shadow.semantic_assessment, 'inconclusive');
  assert.equal(saved.metadata.official_shadow.semantic.official.state, 'matched_fields');
  assert.equal(saved.metadata.official_shadow.semantic.local.state, 'inconclusive');
  assert.equal(saved.metadata.official_shadow.semantic.local.checked_field_count, 0);
  assert.equal(typeof saved.metadata.official_shadow.semantic.local.error_code, 'string');
  assert.deepEqual(saved.metadata.official_shadow.semantic.local.findings, []);
  assert.equal(JSON.stringify(saved.metadata).includes('corrupt'), false);
});

test('semantic gate never makes production call the optional official shadow renderer', async () => {
  const official = await pdf(semanticText());
  const local = await pdf(semanticText());
  const { saved, calls } = await exercise(official, local, 'production');

  assert.deepEqual(calls, ['local']);
  assert.equal(saved.metadata.official_shadow, undefined);
});
