# Agent-safe Fiscal Summary V1

TaxAgent exposes a deterministic, bounded summary of persisted `rtc_calculation` decisions for server-side agents, support channels and future WhatsApp workflows.

Endpoint:

`GET /v1/tax/decisions/:id/agent-summary`

Authentication: TaxAgent API key with `tax:read`.

## Purpose

The endpoint answers a narrow question: **how may this existing fiscal calculation be described safely?**

It does not re-calculate taxes, infer missing fiscal facts, execute payments, bind the calculation to an invoice or expose the raw official-engine payload.

## Output

The response includes only bounded state:

- decision id / effective date;
- status: resolved, requires_input or unsupported;
- regime/environment;
- use: authoritative_calculation_only, reference_only or review_required;
- bounded assessment counts;
- bounded regular freshness state;
- engine id/release/commit;
- a deterministic Portuguese message;
- a machine next-action code;
- explicit policy flags.

The response never contains the stored raw calculation payload, authorized XML, DANFSe/PDF text, taxpayer/customer PII or upstream HTTP bodies.

## Agent/WhatsApp contract

A channel adapter may display or paraphrase the returned deterministic message, but must preserve these hard rules:

- `financial_action_allowed=false`;
- `issuance_binding_allowed=false`;
- `ai_authoritative=false`;
- never turn `reference_only` into definitive tax advice;
- never turn `review_required` into a guessed amount/classification;
- a calculation result does not authorize PIX, transfer, tax remittance or invoice issuance.

A future WhatsApp provider should call TaxAgent server-to-server. TaxAgent API keys must never be embedded in browser/mobile/WhatsApp message payloads.

## Typical routing

- `requires_input` -> collect/correct fiscal inputs;
- `unsupported` -> manual fiscal review;
- resolved + reference_only -> explain as reference only;
- resolved + authoritative -> explain the tax calculation only; execution remains forbidden.

This endpoint is suitable for NexOffices/Nexa PJ agents after those products connect through their own server-side adapter. It does not modify those repositories by itself.
