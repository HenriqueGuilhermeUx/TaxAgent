# Receita Federal RTC sidecars

These Dockerfiles build the official Receita Federal open-source RTC engines from exact release-tag commits.

They are intentionally separate from the TaxAgent API image. TaxAgent consumes them over a private HTTP boundary through `TAXAGENT_RTC_*_URL`.

## Pins

| Engine | Release | Commit |
| --- | --- | --- |
| Regular | 1.6.1 | `150cccbe414d4a5edea703e4f7a424af5aa222c7` |
| Simples Nacional | 0.0.6 | `c5b0f01c8351c3f0d0795cc617b29d233e9f98df` |
| DANFSe | 1.0.0 | `8d79e6b2f7fad6375340afcb51c85ed370c64a14` |

The Simples image generates its read-only SQLite database from the regular engine Flyway dataset at the same pinned regular release, matching the official repository architecture.

## CI conformance

The `official-rtc-conformance` workflow builds every sidecar from its exact SHA, boots it, checks the official health/version contract and, for the regular engine, performs a real official observability calculation.

A successful HTTP response is not enough: the calculation smoke test requires an item state of `CALCULADO` or `CALCULO_SIMULADO` and verifies the returned CST/cClassTrib.

## Safety

These images do not transmit NFS-e, hold TaxAgent A1 certificates or connect to the TaxAgent database. They are deterministic calculation/rendering dependencies. CI builds and probes them before any hosting decision.
