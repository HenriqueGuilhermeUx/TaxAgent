# Customer Fiscal Portal

Customer-facing onboarding surface built over the existing Secure Pilot Intake and fiscal vaults.

Constraints:
- no bootstrap token in the customer journey;
- no raw secret persistence outside the existing certificate/provider credential vaults;
- onboarding/readiness may advance automatically;
- fiscal transmission remains gated and disabled by default;
- TaxAgent Core remains the only fiscal engine consumed by TaxAgent UI, NexOffice and future clients.

## Read-only readiness proof

Authenticated company-scoped consumers may call:

`GET /v1/portal/companies/:companyId/fiscal/proof`

The response is intentionally bounded. It exposes:
- company identifier only (`company.id`), environment and current fiscal/onboarding status;
- route summary;
- stage IDs/status only;
- unresolved requirement codes;
- booleans indicating whether onboarding/preflight evidence exists;
- the next safe action;
- an explicit authorization boundary proving that this surface cannot issue, transmit, enable live runtime, grant a transmission permit or bypass the one-shot TEST permit.

It never returns company profile fields such as name, city code or tax regime; raw onboarding/preflight evidence; certificate material; provider credentials; fiscal payloads; or any capability that authorizes external effects.
