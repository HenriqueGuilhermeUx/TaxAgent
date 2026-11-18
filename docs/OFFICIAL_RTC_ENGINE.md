# Official RTC Engine V1

TaxAgent treats the Receita Federal open-source RTC engines as deterministic fiscal dependencies, not as AI knowledge.

## Pinned upstreams

- Regular regime: `ReceitaFederal/calculadora-rtc-regime-regular` release 1.6.1, pinned commit `0accf834b76a2ce86ad1ad80ec61bbe070ae414e`.
- Simples Nacional: `ReceitaFederal/calculadora-rtc-simples-nacional` release 0.0.6, pinned commit `c5b0f01c8351c3f0d0795cc617b29d233e9f98df`.
- DANFSe: `ReceitaFederal/calculadora-rtc-gerador-danfse` release 1.0.0, pinned commit `8d79e6b2f7fad6375340afcb51c85ed370c64a14`.
- License: MIT for all three upstream repositories.

## Activation modes

`TAXAGENT_RTC_ENGINE_MODE=off` is the default and changes no fiscal behavior.

`shadow` allows explicit API execution for comparison/audit while the current TaxAgent decision remains authoritative.

`official` marks the official engine as eligible to become authoritative for supported flows. Promotion of a TaxAgent flow to this mode still requires contract mapping and differential tests for that flow; changing this variable alone must not silently reinterpret existing invoices.

## API boundary

TaxAgent exposes an authenticated reusable boundary under `/v1/rtc/official` so NexOffices, Nexa PJ and future products can consume one versioned fiscal source instead of embedding tax formulas.

Responses include upstream repository, release, exact commit, input SHA-256 and calculation timestamp. The TaxAgent layer remains responsible for tenancy, authorization, audit, input collection and fail-closed behavior.

## Security

Official engine service URLs are configuration-only and never supplied by end users. Remote endpoints must use HTTPS; loopback HTTP is permitted for local containers. Credentials embedded in URLs are rejected. No production NFS-e transmission gate is changed by this module.

## Next increments

1. Build the three official upstreams as pinned sidecars and add health/version checks.
2. Add golden/differential cases against official examples.
3. Map canonical TaxAgent operations to the official regular and Simples contracts.
4. Persist full engine provenance inside Tax Decisions.
5. Switch DANFSe generation to the official renderer after byte/document conformance tests.
6. Add public simulator and batch CSV/XLSX workflow above the same gateway.
