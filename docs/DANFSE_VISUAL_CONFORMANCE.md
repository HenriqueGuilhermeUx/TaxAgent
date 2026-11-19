# DANFSe Visual Conformance Gate

TaxAgent separates semantic and visual DANFSe conformance.

Semantic shadow comparison is automated and TEST-only. It compares bounded fields extracted independently from the official and local PDFs against the same authorized NFS-e XML. A semantic result of `matched_fields` is necessary but not sufficient to promote the local renderer.

Visual conformance is a manual, append-only attestation tied to one exact persisted local DANFSe document and the exact official PDF SHA-256 observed by shadow execution.

## Preconditions

A visual attestation is accepted only when all of the following are true:

- invoice environment is `test`;
- the referenced document is a persisted `danfse-pdf`;
- official shadow execution succeeded;
- semantic shadow result is `matched_fields`;
- the local PDF hash in shadow metadata equals the persisted document hash;
- an official PDF SHA-256 exists.

## Checklist

A reviewer records a bounded assessment for:

- layout consistency;
- required fiscal fields/sections visible;
- text legibility;
- absence of visible clipping or overlap.

`assessment=matched` requires every checklist item to be true.

## Evidence policy

TaxAgent stores only document IDs, hashes, bounded checklist flags/codes, reviewer API-key ID and timestamps. It never stores the official shadow PDF, raw authorized XML, extracted PDF text or taxpayer PII in this attestation table.

The table is append-only at the database layer.

## Promotion policy

A manual visual attestation is evidence only. It never changes `TAXAGENT_DANFSE_RENDERER_MODE`, never promotes the renderer automatically and never enables production rendering. Production remains subject to an explicit, separately reviewed promotion decision.
