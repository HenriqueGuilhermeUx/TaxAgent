import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { DanfseService } from '../src/danfse/danfse.service';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function exercise(environment: 'test' | 'production', mode: 'shadow' | 'off', fail = false) {
  const oldRtc = process.env.TAXAGENT_RTC_ENGINE_MODE;
  const oldRenderer = process.env.TAXAGENT_DANFSE_RENDERER_MODE;
  process.env.TAXAGENT_RTC_ENGINE_MODE = mode;
  process.env.TAXAGENT_DANFSE_RENDERER_MODE = 'verified';
  const officialPdf = Buffer.from('%PDF-1.7 official');
  const localPdf = Buffer.from('%PDF-1.7 local');
  const calls: string[] = [];
  let saved: any;
  const service = new DanfseService(
    { query: async () => ({ rows: [{ company_id: 'company', status: 'authorized', environment }] }) } as any,
    {
      latestContent: async () => ({ content: Buffer.from('<NFSe/>'), sha256: 'xml-sha' }),
      save: async (value: any) => { saved = value; return value; },
    } as any,
    { parse: () => ({ specVersion: 'NT008-1.02' }) } as any,
    { render: async () => { calls.push('local'); return localPdf; } } as any,
    {
      danfseConfigured: () => true,
      renderDanfse: async () => {
        calls.push('official');
        if (fail) throw new Error('secret upstream response');
        return officialPdf;
      },
    } as any,
  );
  try { await service.generate('invoice'); return { saved, calls, officialPdf, localPdf }; }
  finally {
    if (oldRtc === undefined) delete process.env.TAXAGENT_RTC_ENGINE_MODE;
    else process.env.TAXAGENT_RTC_ENGINE_MODE = oldRtc;
    if (oldRenderer === undefined) delete process.env.TAXAGENT_DANFSE_RENDERER_MODE;
    else process.env.TAXAGENT_DANFSE_RENDERER_MODE = oldRenderer;
  }
}

test('DANFSe TEST shadow records only PDF fingerprints and keeps local PDF', async () => {
  const { saved, calls, officialPdf, localPdf } = await exercise('test', 'shadow');
  assert.deepEqual(calls, ['official', 'local']);
  assert.deepEqual(saved.content, localPdf);
  assert.deepEqual(saved.metadata.official_shadow, {
    mode: 'shadow', status: 'success',
    official_pdf_sha256: sha(officialPdf), official_pdf_bytes: officialPdf.length,
    local_pdf_sha256: sha(localPdf), local_pdf_bytes: localPdf.length,
  });
  assert.equal(JSON.stringify(saved.metadata).includes('official'), true);
  assert.equal(JSON.stringify(saved.metadata).includes('%PDF'), false);
});

test('DANFSe shadow upstream failure does not leak errors or interrupt local rendering', async () => {
  const { saved, calls, localPdf } = await exercise('test', 'shadow', true);
  assert.deepEqual(calls, ['official', 'local']);
  assert.deepEqual(saved.content, localPdf);
  assert.deepEqual(saved.metadata.official_shadow, {
    mode: 'shadow', status: 'failure',
    local_pdf_sha256: sha(localPdf), local_pdf_bytes: localPdf.length,
  });
  assert.equal(JSON.stringify(saved.metadata).includes('secret'), false);
});

test('DANFSe production and off mode never call official shadow renderer', async () => {
  for (const [environment, mode] of [['production', 'shadow'], ['test', 'off']] as const) {
    const { saved, calls } = await exercise(environment, mode);
    assert.deepEqual(calls, ['local']);
    assert.equal(saved.metadata.official_shadow, undefined);
  }
});
