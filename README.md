# TaxAgent

Infraestrutura fiscal API-first para o novo sistema tributário brasileiro.

> Motor primeiro. NFS-e Nacional, IBS/CBS, roteamento fiscal, documentos imutáveis, eventos e automação. Frontend e dashboard vêm depois.

## Estado atual

A branch `agent/engine-v0.1` contém o primeiro motor executável. O modo `mock` é seguro para desenvolvimento. Transmissão real fica bloqueada até que os schemas oficiais tenham sido sincronizados e os builders DPS/eventos tenham sido verificados contra o layout vigente.

### Implementado

- NestJS + TypeScript, Node 22
- PostgreSQL e migrations versionadas
- organizations / companies multi-tenant
- API keys `ta_test_*` e `ta_live_*`, hash-only, revogação e scopes
- idempotência concorrente por empresa
- Certificate Vault A1 PKCS#12 com AES-256-GCM
- Schema Registry separado por Produção, Produção Restrita e preview
- sincronização dos ZIPs XSD oficiais com SHA-256
- validação XML + XSD via `xmllint`
- DPS builder isolado e safety-gated
- XMLDSig isolado
- cliente SEFIN Nacional com mTLS, GZip + Base64
- emissão assíncrona no TaxAgent sobre a emissão síncrona da SEFIN
- consulta por chave e DPS no client
- router national-first com verificação opcional de convênio municipal
- fiscal ledger persistente
- XML DPS assinado e XML NFS-e autorizado persistidos com SHA-256
- cancelamento por evento fiscal com builder e safety gate próprios
- filas duráveis em PostgreSQL com `SKIP LOCKED`, backoff e retentativas
- webhooks HMAC-SHA256 duráveis e prevenção de SSRF com DNS/IP pinning
- health check de banco
- Swagger `/docs`
- CI com typecheck, testes e build
- workflow diário para verificar disponibilidade/estrutura dos schemas oficiais

## Safety gates para modo real

O TaxAgent não deve transmitir para a SEFIN apenas porque o código compila. Para habilitar live mode, todos os gates abaixo devem estar satisfeitos:

1. `npm run schemas:sync` baixa os XSDs oficiais e cria manifests com checksum.
2. O DPS gerado deve passar no XSD oficial do ambiente.
3. `TAXAGENT_DPS_BUILDER_MODE=verified` somente após validação do builder contra os exemplos/layout oficiais vigentes.
4. Eventos têm gate independente: `TAXAGENT_EVENT_BUILDER_MODE=verified`.
5. A empresa precisa ter certificado A1 ativo e válido no vault.
6. Só então `TAXAGENT_LIVE_ENABLED=true` e `TAXAGENT_NFSE_MODE=live` podem ser utilizados.

A NT 009 permanece registrada como preview e não é ativada automaticamente enquanto não estiver efetivamente vigente no ambiente alvo.

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

## Bootstrap da primeira empresa

1. `POST /v1/organizations` com `X-TaxAgent-Bootstrap-Token`.
2. `POST /v1/organizations/:organizationId/companies`.
3. `POST /v1/companies/:companyId/api-keys` para gerar `ta_test_*`.
4. Daí em diante use `Authorization: Bearer ta_test_...`.

A chave completa da API é retornada somente na criação; o banco armazena apenas SHA-256.

## Fluxo de emissão

```text
ERP / SaaS
   │ JSON + Idempotency-Key
   ▼
TaxAgent API
   ▼
Canonical Invoice
   ▼
Fiscal Router ──► Parâmetros / cobertura municipal
   ▼
Tax Engine
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

- `POST /v1/invoices`
- `GET /v1/invoices/:id`
- `POST /v1/invoices/:id/cancel`
- `GET /v1/invoices/:id/documents`
- `GET /v1/invoices/:id/documents/:documentId/content`
- `POST /v1/companies/:companyId/certificates`
- `GET /v1/companies/:companyId/certificates`
- `POST /v1/companies/:companyId/webhooks`
- `GET /v1/companies/:companyId/webhooks`
- `GET /v1/municipalities/:cityCode/convention`
- `GET /v1/schemas/registry`
- `GET /v1/health`

## Fontes técnicas oficiais

O Schema Registry aponta para os artefatos publicados no Portal Nacional da NFS-e (`gov.br/nfse`). Produção e Produção Restrita são tratados como versões independentes. O código não promove automaticamente layouts futuros para produção.

## Próximas camadas

Depois da primeira emissão real validada em Produção Restrita: parâmetros municipais completos, Fiscal Inbox/ADN, DANFSe conforme NT 008, adapters municipais de fallback, Tax Engine IBS/CBS determinístico, apuração/Tax Position e, por último, interfaces visuais. A emissão por voz será uma camada de intenção sobre esta mesma API, nunca um motor fiscal paralelo.
