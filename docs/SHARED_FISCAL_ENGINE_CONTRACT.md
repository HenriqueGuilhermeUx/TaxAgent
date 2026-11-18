# TaxAgent Shared Fiscal Engine Contract

This contract is the integration boundary for NexOffices, Nexa PJ and future Alternative Ventures products. Consumer products must not embed or fork Receita Federal tax formulas.

## Principle

Consumer -> TaxAgent -> pinned Receita Federal engine -> TaxAgent provenance/assessment -> Consumer.

AI may collect and explain facts. It is never the authoritative tax calculator.

## Authentication and tenancy

Use a dedicated server-to-server TaxAgent API key per consuming product/environment. Grant only the scopes required by the integration:

- `tax:read` for engine/freshness inspection.
- `tax:resolve` for calculations.
- Invoice/fiscal execution scopes remain separate and are never implied by calculation access.

Do not reuse customer-facing tokens or bootstrap credentials.

## Readiness

Before enabling a consumer calculation flow:

1. `GET /v1/rtc/official/status`
2. `GET /v1/rtc/official/freshness`
3. require the intended engine to be configured;
4. require TaxAgent mode to be `shadow` during integration;
5. never infer authoritative status from HTTP 200.

The regular engine is not authoritative when the current Receita reference version is ahead of the pinned open-source release.

## Calculation

### Regular regime

`POST /v1/rtc/official/regular/calculate`

The payload must use the Receita Federal contract. TaxAgent will later expose a canonical mapper so consumer products do not need to know Receita field names. Until that mapper is promoted, callers must not fabricate missing fiscal fields.

### Simples Nacional

`POST /v1/rtc/official/simples/calculate`

Effective Simples rates, activity code, classification and document type are fiscal facts. Consumers must provide or collect them from an explicit/verified source; TaxAgent does not guess them.

## Response safety

Every TaxAgent Official RTC response contains:

- pinned upstream repository/release/commit;
- input SHA-256;
- calculation timestamp;
- raw official result;
- normalized `assessment`.

Consumer acceptance rules:

- `authoritative_eligible=true`: every item is `CALCULADO`.
- `simulation_only=true`: result may be displayed as simulation, not booked/executed as definitive tax.
- `input_error`, `unsupported`, `not_calculated`, `technical_failure`, or `unknown`: stop and request review/correction.
- Never use HTTP status alone as fiscal success.

## Audit

Persist the TaxAgent response identifier/provenance and input hash with the originating business operation. Do not log raw fiscal payloads in general application logs.

For batch jobs, preserve row/item correlation and return per-item outcomes. One invalid item must not silently become a zero-tax item.

## Product-specific guidance

### NexOffices

Use TaxAgent as a shared fiscal capability behind office/ERP workflows. NexOffices should own business UX, customer/company context and workflow orchestration; TaxAgent owns fiscal calculation, validation and provenance.

### Nexa PJ

Use TaxAgent for tax simulation/explanation adjacent to PJ financial flows. Financial movement and tax calculation remain separate authorities: a TaxAgent result must never independently authorize a payment, transfer or tax remittance.

## Promotion policy

1. local/pinned conformance;
2. `shadow` integration;
3. differential evidence against official examples/reference version;
4. explicit product acceptance;
5. only then consider `official` mode for a supported flow.

NFS-e production transmission remains governed by its independent homologation and A1/readiness controls.


## Canonical consumer API

Consumers should prefer the stable TaxAgent canonical endpoints instead of the raw Receita-shaped endpoints:

- `POST /v1/rtc/canonical/regular/calculate`
  - V1 supports `document_kind=nfse` and maps it to official `tpDoc=91`.
  - TaxAgent owns the upstream ROC version field.
  - For facts before 2027, nominal rates are forbidden by the pinned engine.
  - From 2027 onward, nominal CBS/IBS state/IBS municipal rates are required by the pinned engine and must be supplied explicitly from a verified source.
- `POST /v1/rtc/canonical/simples/calculate`
  - V1 supports `document_kind=nfe|nfce`, matching the current pinned Simples engine document support (55/65).
  - It does **not** claim NFS-e support for Simples until the official engine contract supports it.
  - `cAtivSN`, `cClassTrib`, base, selective-tax amount and effective Simples rates (when applicable) are facts supplied by the consumer; TaxAgent does not guess them.

The raw endpoints under `/v1/rtc/official/*` remain useful for internal conformance/debugging, but new product integrations should target the canonical boundary.


## Persisted decision provenance

Canonical RTC calculations are persisted in `tax_decisions` with `decision_kind=rtc_calculation`.

The persisted record contains:

- canonical consumer input;
- mapped official-engine payload;
- engine repository/release/exact commit;
- input SHA-256 and calculation timestamp;
- normalized assessment;
- regular-engine freshness evidence when available;
- raw official calculation output;
- explicit `authoritative` and `reference_only` flags.

Existing issuance decisions remain `decision_kind=issuance` by default. The invoice flow rejects `rtc_calculation` decisions even when their calculation status is `resolved`, preventing a simulator/batch result from being reused as an issuance decision.

Until a freshness mechanism is implemented for the pinned Simples engine, persisted Simples calculations remain `reference_only=true`.
