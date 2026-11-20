# TaxAgent RTC Simulator & Batch Core V1

This core is the safe backend boundary for the future TaxAgent simulator UI and bulk workflows.

## Readiness

`GET /v1/rtc/simulator/readiness` reports whether regular/Simples calculation is actually available. Validation-only remains available even when RTC mode is `off` or sidecars are not configured.

The response also carries the regular freshness state and makes these policy constraints explicit:

- financial actions are never authorized by simulator output;
- invoice issuance is never authorized by simulator output;
- Simples is reference-only until an explicit freshness mechanism exists;
- regular authoritative availability requires RTC official mode, configured engine and freshness match.

## Validation-only

- `POST /v1/rtc/simulator/regular/validate`
- `POST /v1/rtc/simulator/simples/validate`

These endpoints validate the stable canonical contract without calling an RTC sidecar and without persisting a TaxDecision.

For the regular engine they enforce the pinned year contract: nominal rates are forbidden before 2027 and required from 2027 onward.

## Batch JSON

- `POST /v1/rtc/simulator/regular/batch`
- `POST /v1/rtc/simulator/simples/batch`

Maximum 100 rows per request.

`execution=validate` validates rows only.

`execution=calculate` uses the same canonical RTC service and therefore persists ordinary audited `rtc_calculation` TaxDecisions for successful calculations.

Every row keeps its `operation_id` and has its own outcome. Invalid/unavailable rows never become zero-tax rows and do not silently contaminate successful rows.

## Public UI

This is intentionally authenticated server-side core, not an unauthenticated public calculator. A public web simulator must use a separately reviewed session/rate-limit boundary and must preserve `reference_only`/freshness disclosures.


## Batch CSV/XLSX

Authenticated consumers may also upload a bounded file:

- `POST /v1/rtc/simulator/regular/batch-file`
- `POST /v1/rtc/simulator/simples/batch-file`

The upload field is `file`. Supported formats: UTF-8 CSV and XLSX. Use query `execution=validate|calculate`; the safe default is `validate`, which does not call a sidecar or persist a TaxDecision.

Safety limits:

- max 2 MiB compressed/upload size;
- max 100 data rows;
- max 32 columns;
- max 512 characters per cell;
- XLSX max 10 MiB declared uncompressed content and 100 ZIP entries;
- formulas, VBA/macros, OLE/embedded objects and external-link parts are refused;
- only the first worksheet is processed;
- validate mode works while engines are off/unhosted;
- calculate rows are processed sequentially to avoid sidecar bursts.

The importer is only a transport adapter. Each valid row is converted to the same canonical TaxAgent contract and a successful calculation persists the same audited `rtc_calculation` TaxDecision used by JSON callers. Invalid rows remain explicit failures; they never become zero-tax results and never authorize financial or issuance actions.

### Regular CSV/XLSX columns

Required: `operation_id`, `effective_at`, `municipality_code`, `uf`, `nbs`, `cst`, `tax_classification`, `tax_base`.

Optional: `item_number`, `quantity`, `unit`, `cbs`, `ibs_state`, `ibs_municipal`.

If any nominal rate is supplied, all three must be supplied. The canonical year contract still applies: rates are forbidden before 2027 and required from 2027 onward by the pinned regular engine.

### Simples CSV/XLSX columns

Required: `operation_id`, `effective_date`, `document_kind`, `crt`, `activity_code`, `tax_classification`, `tax_base`, `selective_tax_amount`.

Optional: `item_number`, `ibs_cbs_regime_type`, `government_entity_type`, `ibs_effective_rate`, `cbs_effective_rate`.

The pinned Simples 0.0.6 engine supports NF-e (`nfe`/55), NFC-e (`nfce`/65) and NFS-e (`nfse`/91). NFS-e activity/document compatibility remains an official fiscal fact; the importer does not infer `cAtivSN` or effective rates.
