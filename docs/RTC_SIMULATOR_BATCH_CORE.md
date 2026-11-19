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
