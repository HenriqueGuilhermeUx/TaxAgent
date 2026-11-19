# DANFSe shadow semantic conformance — implementation contract (draft)

Status: **design only; NOT a verified comparator or fiscal authorization**. Applies to the TaxAgent DANFSe TEST shadow path only. The official PDF is never returned, persisted, or logged by this diagnostic path.

## Trust boundaries
- Authorized NFS-e XML is the canonical input. Parse it with the existing `DanfseParserService`; preserve fiscal identifiers as strings (leading zeroes and decimal precision).
- The official and local PDF are untrusted binary artifacts. A valid PDF header, HTTP 200, matching SHA-256 or extracted text alone does **not** establish semantic or visual conformity.
- Production taxpayer XML must never be sent to the optional shadow renderer. `TAXAGENT_RTC_ENGINE_MODE=off` remains the default.
- Never promote an official renderer from this comparison. Renderer promotion requires separately reviewed official resources, version/freshness validation, real homologation and explicit authorization.
- No external error bodies, raw XML, PDF contents, taxpayer identifiers, or extracted text in telemetry. Persist only bounded, non-sensitive assessment codes and existing hashes/sizes.

## Candidate semantic checks (future implementation)
Compare both rendered PDFs **independently** to the same parsed authorized XML model; never infer correctness from PDF-to-PDF agreement alone.

| Group | Canonical model source | Requirement |
| --- | --- | --- |
| Document | accessKey, number, issuedAt, competence, environment, status | Exact identity and environment; absence is inconclusive |
| Parties | provider/customer taxId, name; intermediary where applicable | Tax IDs exact after formatting-only normalization; names not silently substituted |
| Service | nationalCode, municipalCode, nbs, description | Preserve codes and meaningful description; do not invent absent fields |
| ISS | base, rate, amount, retained | Compare decimal values exactly after documented scale normalization; missing is inconclusive |
| IBS/CBS | cstClass, base, effective rates, state/municipal/CBS amounts and totals | Compare each applicable component separately; never infer missing values |
| Totals | service, retentions, net, netPlusIbsCbs | Decimal exactness and cross-field reconciliation where required by the official specification |
| Presentation | labels, page count, clipping, QR/access-key legibility | Requires visual review; text extraction cannot prove this |

A missing canonical value is **not** evidence that either PDF is correct. A field missing from one extracted PDF is **not** a match. Optional fields must be classified from the official specification and actual XML facts, not from guesses.

## Assessment state machine
- `not_assessed`: current safe default whenever both PDFs exist; **no semantic comparison has run**.
- Proposed future `inconclusive`: unsupported PDF, extraction failure, missing required fields, unsupported specification or ambiguous normalization.
- Proposed future `different`: at least one verifiable canonical fiscal field disagrees.
- Proposed future `matched_fields`: all required machine-checkable fields agree with XML **but visual conformance remains unverified**; never equivalent to `verified`.
- Upstream renderer failure: preserve `status=failure`, omit semantic assessment (current behavior).

`not_assessed` remains the only state emitted by the runtime shadow path. The pure comparator core can now return `inconclusive`, `different` or `matched_fields` in isolation, but those states are not wired to runtime metadata until an independent PDF extraction layer is separately tested, reviewed and merged. Any unexpected state fails closed.

## Acceptance gates for future comparator PRs
1. Exact-head CI and `official-rtc-conformance` green; TEST shadow only.
2. Golden fixtures: exact match, conflicting CNPJ, leading-zero code, decimal precision, missing required field, multi-page, corrupt/encrypted PDF, upstream timeout, and extraction ambiguity.
3. Verify both PDFs independently against XML; document parser version, field allowlist and normalization rules.
4. Negative tests prove neither PDF is persisted except the existing local output, no sensitive content enters metadata/logs, and no production or off-mode sidecar call occurs.
5. Visual checks remain a separate manual evidence gate; no automatic fiscal promotion or production NFS-e transmission.
6. Any official regular RTC result remains non-authoritative unless `freshness=match` and assessment is eligible; HTTP 200 alone is never success.

## Existing implementation
`src/danfse/danfse.service.ts` records `official_shadow.byte_comparison` and `semantic_assessment: not_assessed` in TEST shadow, and `tests/danfse-shadow-evidence.test.ts` checks equality, inequality, upstream failure and off/production isolation. This document does not change runtime behavior. `src/danfse/danfse-semantic-comparator.ts` implements the isolated field-comparison core. `src/danfse/danfse-official-text-extractor.ts` implements a bounded official-label parser for text already extracted from PDF. Raw PDF parsing, runtime wiring and visual validation remain pending.
