# TaxAgent

Infraestrutura fiscal API-first para o novo sistema tributário brasileiro.

> Motor primeiro. NFS-e Nacional, IBS/CBS, roteamento fiscal, documentos imutáveis, eventos e automação. Frontend e dashboard de produto vêm depois.

## Homologação 100% pelo navegador

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/HenriqueGuilhermeUx/TaxAgent/tree/agent/engine-v0.1)

O botão acima usa o `render.yaml` da branch `agent/engine-v0.1` para preparar um ambiente de **Produção Restrita**, com Web Service Docker + PostgreSQL e os gates live desligados por padrão.

Depois do deploy:

- Console técnica: `https://SEU-SERVICO.onrender.com/v1/homologation`
- Swagger: `https://SEU-SERVICO.onrender.com/docs`
- Health: `https://SEU-SERVICO.onrender.com/v1/health`

A Console permite, sem PowerShell ou terminal:

1. criar Organization + Company + API key TEST;
2. selecionar e enviar o A1 `.pfx/.p12` diretamente do navegador;
3. executar readiness/preflight sem emissão;
4. resolver e persistir a Tax Decision;
5. executar DPS dry-run `build → XSD → A1/XMLDSig → XSD`, sem transmissão;
6. somente após todos os gates, executar uma primeira DPS em Produção Restrita com confirmação explícita e `Idempotency-Key`.

**Nunca envie PFX/P12, senha do A1, master key, bootstrap token ou API key para GitHub, issue, chat ou logs.** Veja `docs/BROWSER_HOMOLOGATION.md`.

## Estado atual

A branch `agent/engine-v0.1` contém o primeiro motor executável. O modo `mock` é seguro para desenvolvimento/homologação inicial. Transmissão real fica bloqueada até que schemas, empresa, certificado, decisão fiscal, dry-run e readiness estejam validados.

### Implementado

- NestJS + TypeScript, Node 22
- PostgreSQL e migrations versionadas/idempotentes
- organizations / companies multi-tenant
- API keys `ta_test_*` e `ta_live_*`, hash-only, revogação e scopes
- idempotência concorrente por empresa
- Certificate Vault A1 PKCS#12 com AES-256-GCM
- validação de certificado + chave privada + validade + CNPJ ICP-Brasil do titular
- upload A1 browser-native via multipart
- Schema Registry separado por Produção, Produção Restrita e preview
- sincronização dos ZIPs XSD oficiais com SHA-256
- validação XML + XSD via `xmllint`
- DPS builder isolado e safety-gated
- XMLDSig RSA-SHA256/SHA-256
- cliente SEFIN Nacional com mTLS, GZip + Base64
- emissão assíncrona no TaxAgent sobre a emissão síncrona da SEFIN
- consulta por chave e DPS no client
- retry fiscal que reutiliza a identidade/XML da DPS e reconcilia antes de retransmitir
- router national-first com parâmetros/convênio municipal
- fiscal ledger persistente
- XML DPS assinado e XML NFS-e autorizado persistidos com SHA-256
- cancelamento por evento fiscal com builder e safety gate próprios
- filas duráveis em PostgreSQL com `SKIP LOCKED`, backoff e retentativas
- webhooks HMAC-SHA256 duráveis e transactional outbox
- prevenção de SSRF com DNS/IP pinning
- Fiscal Inbox / ADN por NSU
- Tax Engine IBS/CBS determinístico com `tax_decision_id`
- Tax Position e payment matching foundations
- DANFSe NT008 v1.02 sob safety gate visual
- Console técnica `/v1/homologation`, habilitada apenas por feature flag
- Swagger `/docs`
- CI com audit, typecheck, testes, PostgreSQL real, migrations, boot da API, smoke da Console e Docker build
- workflow de schema-watch contra os XSDs oficiais pinados

## Safety gates para modo real

O TaxAgent não transmite para a SEFIN apenas porque o código compila. Para habilitar live mode, todos os gates aplicáveis precisam estar satisfeitos:

1. XSD oficial vigente sincronizado e checksum validado.
2. DPS gerada passa no XSD oficial.
3. DPS assinada passa novamente no XSD oficial.
4. A1 ativo, válido, com chave privada correspondente e CNPJ igual ao da Company.
5. Parâmetros/convênio municipal consultáveis no ambiente alvo.
6. Tax Decision persistida e `resolved` para `cIndOp`, `CST` e `cClassTrib` usados.
7. DPS dry-run real retorna `valid=true` e `transmitted=false`.
8. `TAXAGENT_DPS_BUILDER_MODE=verified` somente após revisão do dry-run.
9. Só então `TAXAGENT_LIVE_ENABLED=true` e `TAXAGENT_NFSE_MODE=live` podem ser utilizados.

A NT 009 permanece tratada separadamente enquanto não estiver efetivamente vigente no ambiente alvo.

## Desenvolvimento local

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run start:dev
```

Para gerar uma chave AES-256 de desenvolvimento:

```bash
openssl rand -base64 32
```

Use o resultado em `TAXAGENT_MASTER_KEY_B64` e configure um `TAXAGENT_BOOTSTRAP_TOKEN` forte.

## Fluxo de emissão

```text
ERP / SaaS / Console de Homologação
   │ JSON + Idempotency-Key
   ▼
TaxAgent API
   ▼
Canonical Invoice
   ▼
Tax Decision / Tax Engine
   ▼
Fiscal Router ──► Parâmetros / cobertura municipal
   ▼
DPS Builder
   ▼
XSD Validation
   ▼
XMLDSig + A1
   ▼
SEFIN Nacional (mTLS)
   ▼
NFS-e XML autorizado
   ├─► Fiscal Documents + SHA-256
   ├─► Fiscal Ledger
   └─► Webhook assinado
```

## Endpoints principais

- `GET /v1/homologation`
- `POST /v1/invoices`
- `GET /v1/invoices/:id`
- `POST /v1/invoices/:id/cancel`
- `GET /v1/invoices/:id/documents`
- `GET /v1/invoices/:id/documents/:documentId/content`
- `POST /v1/companies/:companyId/certificates`
- `POST /v1/companies/:companyId/certificates/upload`
- `GET /v1/companies/:companyId/certificates`
- `POST /v1/tax/resolve`
- `POST /v1/operations/readiness/:companyId/probe`
- `POST /v1/operations/dps/validate`
- `POST /v1/companies/:companyId/webhooks`
- `GET /v1/companies/:companyId/webhooks`
- `GET /v1/municipalities/:cityCode/convention`
- `GET /v1/schemas/registry`
- `GET /v1/health`

## Fontes técnicas oficiais

O Schema Registry aponta para os artefatos publicados no Portal Nacional da NFS-e (`gov.br/nfse`). Produção e Produção Restrita são tratados como versões independentes. O código não promove automaticamente layouts futuros para produção.

## Próximas camadas

Depois da primeira emissão real validada em Produção Restrita: ampliar regimes/cenários fiscais, parâmetros municipais completos, adapters municipais de fallback, Tax Engine profundo, apuração/reconciliação, DeRE e payment/split workflows. Interfaces de produto ficam para depois do motor. A emissão por voz será uma camada de intenção sobre esta mesma API, nunca um motor fiscal paralelo.
