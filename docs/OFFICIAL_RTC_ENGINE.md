# Official RTC Engine V1

TaxAgent treats the Receita Federal open-source RTC engines as deterministic fiscal dependencies, not as AI knowledge.

## Pinned upstreams

- Regular regime: `ReceitaFederal/calculadora-rtc-regime-regular` release 1.6.1, exact tag commit `150cccbe414d4a5edea703e4f7a424af5aa222c7`.
- Simples Nacional: `ReceitaFederal/calculadora-rtc-simples-nacional` release 0.0.6, exact tag commit `c5b0f01c8351c3f0d0795cc617b29d233e9f98df`.
- DANFSe: `ReceitaFederal/calculadora-rtc-gerador-danfse` release 1.0.0, exact tag commit `8d79e6b2f7fad6375340afcb51c85ed370c64a14`.
- License: MIT for all three upstream repositories.

Pins must follow the commit referenced by the published Git tag, not an intermediate merge commit or a moving `main`.

## Activation modes

`TAXAGENT_RTC_ENGINE_MODE=off` is the default and changes no fiscal behavior.

`shadow` allows explicit API execution for comparison/audit while the current TaxAgent decision remains authoritative.

`official` marks the official engine as eligible to become authoritative for supported flows. Promotion of a TaxAgent flow to this mode still requires contract mapping and differential tests for that flow; changing this variable alone must not silently reinterpret existing invoices.

## API boundary

TaxAgent exposes an authenticated reusable boundary under `/v1/rtc/official` so NexOffices, Nexa PJ and future products can consume one versioned fiscal source instead of embedding tax formulas.

Responses include upstream repository, release, exact commit, input SHA-256 and calculation timestamp. The TaxAgent layer remains responsible for tenancy, authorization, audit, input collection and fail-closed behavior.

## Sidecar policy

The official upstream applications run as isolated sidecars built from exact pinned commits. The regular and Simples engines run with their official `offline` profiles and a read-only SQLite database generated at build time. The Simples application intentionally reuses the regular engine's Flyway dataset, matching the Receita Federal repository architecture.

Sidecars are tested in CI before any hosting decision. No paid runtime is created automatically.

## Security

Official engine service URLs are configuration-only and never supplied by end users. Remote endpoints must use HTTPS; loopback HTTP is permitted for local containers. Credentials embedded in URLs are rejected. No production NFS-e transmission gate is changed by this module.

## Next increments

1. Build the three official upstreams as pinned sidecars and add health/version checks.
2. Add golden/differential cases against official examples.
3. Map canonical TaxAgent operations to the official regular and Simples contracts.
4. Persist full engine provenance inside Tax Decisions.
5. Switch DANFSe generation to the official renderer after byte/document conformance tests.
6. Add public simulator and batch CSV/XLSX workflow above the same gateway.


## Golden conformance sources

The regular smoke case is copied from the official Receita Federal `docs/exemplos.md` for the pinned regular release. Simples conformance includes the pinned upstream NF-e case `SimplesNacionalControllerTest.deveCalcularCaminhoFelizCrt1ComImpostoSeletivoForaDaReceitaBruta` and the NFS-e case `atividadeVinculadaCalculaNoDocumentoCertoENaoCalculaNoErrado` (`tpDoc=91`, `cAtivSN=07`). These fixtures are kept as upstream-derived conformance evidence; TaxAgent does not invent document support, activities, rates or expected tax outcomes.


## Simples freshness evidence

The pinned Simples sidecar exposes the upstream offline `GET /api/versao/status` comparator. TaxAgent consumes that endpoint only as bounded freshness evidence.

The comparison is intentionally split:
- the local Simples application version must match the pinned release;
- the shared RTC/Flyway tax dataset reports whether its database version/date matches the online reference;
- the upstream remote application version is **not** treated as a verified Simples application-version source, because the offline comparator may point at the shared RTC online service.

Therefore Simples remains `authoritative_eligible=false` even if the shared dataset matches, until a trusted remote Simples application-version source is explicitly established. A dataset mismatch or unavailable status also remains fail-closed.
