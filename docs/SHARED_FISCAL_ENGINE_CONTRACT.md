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
