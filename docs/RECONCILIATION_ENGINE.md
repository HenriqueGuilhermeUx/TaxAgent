# TaxAgent Fiscal Reconciliation Engine

The reconciliation layer connects fiscal documents and payment evidence without treating payment data as tax authority.

## Invariants

- Payment confirmation is financial evidence, not an IBS/CBS credit, debit or assessment event.
- OCR/AI extraction is never sufficient to create fiscal ledger effects automatically.
- A confirmed payment match is explicit and auditable.
- Ambiguous or divergent records become operational reconciliation cases.
- Case resolution never changes tax position unless a separate fiscal rule/decision explicitly does so.

## Flow

Fiscal document -> Document Intake -> Payment Matching -> Financial Evidence -> Reconciliation Report -> Reconciliation Case -> human/system resolution -> Ledger/Webhook trail.

## Report

`GET /v1/documents/reconciliation?days=45`

Findings include:

- `document_without_payment`
- `payment_without_document`
- `document_match_unconfirmed`
- `payment_match_unconfirmed`
- `payment_under_amount`
- `payment_over_amount`
- `counterparty_divergence`
- `duplicate_payment_signature`

The report is read-only and has `authoritative_tax_effects_applied=false`.

## Persistent queue

`POST /v1/documents/reconciliation/sync?days=45` generates/refreshed persistent cases from the report.

`GET /v1/documents/reconciliation/cases?status=open,investigating&severity=high`

`GET /v1/documents/reconciliation/cases/:caseId`

`POST /v1/documents/reconciliation/cases/:caseId/status`

Example body:

```json
{
  "status": "resolved",
  "resolution_code": "paid_elsewhere",
  "note": "Payment confirmed in external bank statement and reviewed by operator."
}
```

Lifecycle:

`open -> investigating -> resolved|ignored`

A resolved or ignored case can be reopened if the divergence is detected again or explicitly moved back to `open`.

Each transition is written to `reconciliation_case_events`. When the case is tied to an invoice, the transition is also written to the Fiscal Ledger. Webhooks are emitted for opened/reopened/status transitions.

## Safety

Resolution or reconciliation does not automatically create IBS/CBS effects. Every reconciliation event carries `tax_effect_applied=false` unless a future explicit fiscal workflow applies an authoritative rule.
