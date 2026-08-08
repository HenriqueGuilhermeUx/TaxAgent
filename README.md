# TaxAgent

Infraestrutura fiscal API-first para o novo sistema tributário brasileiro.

> Backend-first: NFS-e Nacional, IBS/CBS, motor fiscal, ledger, eventos e automação.

## Prioridade

O motor fiscal é o produto. Frontend e dashboard ficam para depois.

## v0.1 — primeiro corte vertical

- `POST /v1/invoices` aceita uma operação fiscal canônica e responde `202`.
- `GET /v1/invoices/:id` retorna o estado e o ledger da operação.
- `GET /v1/health` expõe o healthcheck.
- `NfseNationalProvider` existe atrás de um `FiscalRouterService`.
- O provider roda em `mock` por padrão.
- Modo live permanece deliberadamente bloqueado até implementarmos DPS, XSD, XMLDSig, cofre A1 e mTLS corretamente.

## Executar

```bash
npm install
cp .env.example .env
npm run start:dev
```

Swagger: `http://localhost:3000/docs`

## Próxima etapa

1. persistência PostgreSQL;
2. Certificate Vault A1;
3. Schema Registry oficial versionado;
4. DPS Builder;
5. validação XSD;
6. XMLDSig;
7. mTLS e integração real com produção restrita da NFS-e Nacional;
8. eventos, ADN e webhooks duráveis.
