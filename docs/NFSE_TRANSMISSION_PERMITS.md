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
→ provider reconciles GET /dps/{id}
→ if already exists: no permit claim, no POST
→ if absent: atomically claim permit
→ POST /nfse exactly once
→ definitive response: consume permit
→ uncertain response: keep claimed, reconcile on retry
```

## Production

The first implementation rejects permit claims for `environment=production`.

Production authorization requires a separate release process after repeatable homologation evidence exists.
