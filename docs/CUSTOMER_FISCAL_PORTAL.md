# Customer Fiscal Portal

Customer-facing onboarding surface built over the existing Secure Pilot Intake and fiscal vaults.

Constraints:
- no bootstrap token in the customer journey;
- no raw secret persistence outside the existing certificate/provider credential vaults;
- onboarding/readiness may advance automatically;
- fiscal transmission remains gated and disabled by default;
- TaxAgent Core remains the only fiscal engine consumed by TaxAgent UI, NexOffice and future clients.
