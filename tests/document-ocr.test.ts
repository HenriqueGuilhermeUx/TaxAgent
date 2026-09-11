import assert from 'node:assert/strict';
import test from 'node:test';
import { AzureDocumentOcrService } from '../src/document-intake/azure-document-ocr.service';

function withEnv(values: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  return fn().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test('Automatic OCR is opt-in and disabled by default', async () => {
  await withEnv({ TAXAGENT_DOCUMENT_OCR_PROVIDER: undefined }, async () => {
    const service = new AzureDocumentOcrService();
    assert.equal(service.enabled(), false);
    await assert.rejects(service.start(Buffer.from('fake-pdf')), /Automatic OCR is disabled/);
  });
});

test('Azure OCR rejects non-HTTPS/custom endpoint before any document egress', async () => {
  await withEnv({
    TAXAGENT_DOCUMENT_OCR_PROVIDER: 'azure_document_intelligence',
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://example.com',
    AZURE_DOCUMENT_INTELLIGENCE_KEY: 'test-key',
    TAXAGENT_DOCUMENT_OCR_ALLOW_CUSTOM_ENDPOINT: 'false',
  }, async () => {
    const service = new AzureDocumentOcrService();
    await assert.rejects(service.start(Buffer.from('fake-pdf')), /not an approved cognitiveservices\.azure\.com host/);
  });
});
