# TaxAgent — One-shot NFS-e Transmission Permits

## Purpose

Global live gates are necessary but not sufficient for a controlled fiscal pilot.

During the first homologation cycle, a real National NFS-e POST requires an additional authorization bound to exactly:

- one Company;
- environment `test`;
- provider `nfse-national`;
- one already-signed immutable Prepared DPS;
- a short expiration window;
- one fiscal POST attempt.

The permit does not authorize Production.

## State machine

```
active
  ├─ expires → expired
  ├─ operator revokes before use → revoked
  └─ provider atomically claims immediately before POST → claimed
         └─ definitive authorized/rejected response → consumed
```

A `claimed` permit is intentionally **not reusable**.

If HTTP state becomes uncertain after claim, TaxAgent must reconcile by immutable DPS ID. It must never blindly POST again using the same permit.

## Management API

Protected by Bootstrap Guard:

- `POST /v1/operations/transmission-permits`
- `GET /v1/operations/transmission-permits?company_id=...`
- `POST /v1/operations/transmission-permits/:id/revoke`

Grant confirmation must equal:

`AUTHORIZE-ONE-NATIONAL-TEST-TRANSMISSION`

Revoke confirmation must equal:

`REVOKE-UNUSED-TRANSMISSION-PERMIT`

The grant endpoint does not transmit anything.

## Runtime sequence

```
signed Prepared DPS
→ readiness/probe
→ one-shot permit
→ POST /v1/invoices
→ worker/provider validates global gates
→ provider verifies active A1 fingerprint still matches the certificate that signed the Prepared DPS
→ provider reconciles GET /dps/{id}
→ if already exists: no POST; any prior claimed permit owned by this invoice is settled as consumed
→ if absent: atomically claim permit
→ POST /nfse exactly once
→ definitive response: consume permit
→ uncertain response: keep claimed, reconcile on retry
```

## Production

The first implementation rejects permit claims for `environment=production`.

Production authorization requires a separate release process after repeatable homologation evidence exists.


## Certificate rotation

A signed Prepared DPS is cryptographically bound to the A1 certificate fingerprint recorded at signing time. If the active A1 changes before transmission, TaxAgent fails closed with `TA_PREPARED_DPS_CERTIFICATE_STALE` before any provider network call. The operator must prepare and sign a fresh DPS with the active certificate.


## First-invoice script

`scripts/homologation-first-invoice.ts` now requires two independent explicit confirmations before it can reach the invoice POST:

- `TAXAGENT_CONFIRM_FIRST_TRANSMISSION=YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS`
- `TAXAGENT_CONFIRM_ONE_SHOT_PERMIT=AUTHORIZE-ONE-NATIONAL-TEST-TRANSMISSION`

After issuer-readiness, Prepared DPS signing and readiness/probe succeed, the script grants a 15-minute TEST-only permit bound to that exact signed Prepared DPS. If permit metadata does not match, the script stops before creating the invoice request.
