# TaxAgent Document Intake

Document Intake turns incoming fiscal/business documents into a canonical TaxAgent representation while preserving source authority, provenance and an explicit approval boundary before Fiscal Ledger effects.

## Pipeline

```text
XML / text extracted from PDF, image, receipt or contract
        ↓
Document Intake
        ↓
Extractor adapter
  ├─ native deterministic XML
  └─ DocStruct text extraction
        ↓
Canonical Fiscal Document v1
        ↓
source lineage + SHA-256 + confidence + missing fields
        ↓
Fiscal Inbox
        ↓
explicit approval + invoice binding
        ↓
Fiscal Ledger
```

## Authority policy

- Vetted NFS-e XML parsed by the native deterministic adapter is an authoritative fiscal source.
- Unknown XML remains explicitly unvetted even though its source is XML.
- Text, OCR, PDF-derived text, image-derived text and DocStruct output are extraction evidence only. They are never promoted to authoritative fiscal data automatically.
- No Document Intake extraction creates a Fiscal Ledger entry by itself.
- Posting requires an existing invoice in the same Company/environment plus the literal confirmation `APPROVE-DOCUMENT-INTAKE`.
- Posting is transactional and idempotent at the intake level.

## Endpoints

### `POST /v1/documents/extract`

Authenticated with a TaxAgent API key carrying `documents:write`.

Example native XML request:

```json
{
  "source_type": "xml",
  "content": "<NFSe>...</NFSe>",
  "provider": "native",
  "persist": true,
  "send_to_inbox": true
}
```

Example DocStruct request:

```json
{
  "source_type": "text",
  "content": "texto previamente extraído do documento",
  "document_type": "invoice",
  "provider": "docstruct"
}
```

DocStruct must first be explicitly enabled by environment configuration. The safe default is native/local processing.

### `GET /v1/documents/intake/:intakeId`

Returns the persisted intake, canonical document, authority, confidence, SHA-256, Inbox binding and linked invoice when one exists. Requires `documents:read`.

### `POST /v1/documents/intake/:intakeId/approve`

```json
{
  "invoice_id": "inv_...",
  "confirmation": "APPROVE-DOCUMENT-INTAKE"
}
```

This is the explicit side-effect boundary. TaxAgent validates tenant and environment ownership, locks the intake in a database transaction, appends `document-intake.posted` to the existing invoice's Fiscal Ledger and marks the intake as posted. Repeating the exact same approval is idempotent; attempting to bind an already-posted intake to another invoice is rejected.

## Fiscal Inbox integration

Externally ingested documents are inserted into the existing `inbox_documents` store with:

- `source=document-intake`
- stable `source_reference=intake_id`
- negative internal NSU values so they cannot collide with official ADN NSUs
- original source SHA-256 and content
- canonical extraction metadata

The normal `inbox.document.received` webhook is emitted for a newly inserted Intake document.

## DocStruct adapter

Configuration:

```dotenv
TAXAGENT_DOCUMENT_INTAKE_PROVIDER=native
DOCSTRUCT_ENABLED=false
DOCSTRUCT_BASE_URL=https://docstruct.marwannaili-23-07.workers.dev
DOCSTRUCT_BEARER_TOKEN=
DOCSTRUCT_REQUEST_TIMEOUT_MS=15000
```

`DOCSTRUCT_ENABLED=false` is intentional. It prevents document contents from being sent to an external provider unless the operator opts in explicitly.

The current adapter targets the publicly documented text extraction surface (`POST /v1/extract`). Binary PDF/image upload is not assumed by TaxAgent until a documented provider contract is available. A future OCR/vision adapter can feed extracted text through the same canonical pipeline without changing the Tax Engine, Inbox or Ledger contracts.

## Canonical model

`taxagent.document-intake.v1` includes at minimum:

- document family
- source type and authority
- confidence
- supplier/customer identifiers when extracted
- document number and issue date when extracted
- BRL total when extracted
- source SHA-256
- missing fields
- warnings
- lineage: provider, extraction method and authoritative flag

## Safety invariant

**Extraction is not accounting and extraction is not tax authority.** Document Intelligence may propose structured data; deterministic fiscal rules and explicit workflow boundaries decide whether that data can affect TaxAgent state.
