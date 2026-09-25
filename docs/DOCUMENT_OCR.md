# TaxAgent Binary Document OCR

Binary PDF/image OCR is optional and disabled by default. Raw uploaded bytes remain encrypted at rest inside TaxAgent. External egress occurs only after an authenticated caller explicitly starts OCR and `TAXAGENT_DOCUMENT_OCR_PROVIDER=azure_document_intelligence` is configured.

## Provider

First supported binary OCR provider: Azure Document Intelligence `prebuilt-read`, REST API `2024-11-30`.

TaxAgent submits the encrypted file bytes only at the processing boundary, as Base64 JSON to the configured Azure resource. The Azure analyze call is asynchronous and returns an `Operation-Location`; TaxAgent persists the operation state and exposes explicit polling.

## Configuration

```env
TAXAGENT_DOCUMENT_OCR_PROVIDER=azure_document_intelligence
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://<resource>.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_KEY=<secret>
TAXAGENT_DOCUMENT_OCR_HTTP_TIMEOUT_MS=20000
TAXAGENT_DOCUMENT_OCR_ALLOW_CUSTOM_ENDPOINT=false
```

Custom endpoints are refused unless explicitly enabled. HTTPS is always required.

## API flow

1. Upload: `POST /v1/documents/intake/upload`
2. Start OCR: `POST /v1/documents/intake/files/:fileId/ocr`
3. Poll: `POST /v1/documents/intake/files/:fileId/ocr/poll`
4. When Azure returns `succeeded`, TaxAgent stores the extracted text through Document Intake with provenance:
   - provider: `azure_document_intelligence`
   - method: `prebuilt-read`
   - authority: `unverified_text`
   - authoritative: `false`
5. The resulting intake can enter Fiscal Inbox but cannot create fiscal/ledger effects without explicit approval.

Manual extracted text remains available through `POST /v1/documents/intake/files/:fileId/extracted-text`, and is recorded as `manual_extracted_text` provenance.

## Safety invariants

- OCR output is never a fiscal authority source.
- OCR does not silently create IBS/CBS credits/debits.
- OCR does not silently post to Fiscal Ledger.
- Original bytes are not logged.
- Azure key is never persisted with a document record.
- Operation URLs are restricted to the configured Azure origin and the expected `prebuilt-read/analyzeResults` path.
- DocStruct remains text-only; TaxAgent does not invent undocumented binary DocStruct support.
