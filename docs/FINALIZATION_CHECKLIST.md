# TaxAgent — Finalization Checklist

Objetivo: encerrar o ciclo de construção do motor v0.1 e entrar em homologação real sem misturar feature development com validação de Produção Restrita.

## 1. Código e banco

- [x] NestJS/TypeScript + PostgreSQL + migrations idempotentes
- [x] multi-tenant company/environment isolation
- [x] API keys/scopes
- [x] durable jobs/webhooks/outbox
- [x] Certificate Vault A1
- [x] Schema Registry/XSD validation
- [x] DPS builder + XMLDSig
- [x] SEFIN client + mTLS
- [x] emissão/consulta/cancelamento
- [x] Fiscal Ledger/Documents
- [x] Fiscal Inbox/ADN
- [x] Tax Engine + Tax Position
- [x] Document Intake + encrypted raw files
- [x] OCR opt-in
- [x] Payment Matching/Reconciliation Cases
- [x] Economic Operations
- [x] Payment Allocations
- [x] testes finais de consistência de allocations: replacement + split de pagamento entre operações
- [x] confirmação duplicada de pagamento reporta evidência financeira de forma verificável/idempotente
- [x] Tax Position isolada por Company + ambiente TEST/PRODUCTION
- [x] migrations 001..024 revisadas em banco limpo e em execução idempotente pelo CI
- [x] queries SQL críticas de reconciliation/financial evidence/Tax Position revisadas

Nota de escopo v0.1: verdadeiro matching N:N entre múltiplos documentos e múltiplos pagamentos fica fora do primeiro marco de homologação. O motor já suporta múltiplos pagamentos por operação e split de um pagamento entre operações; não vamos ampliar o modelo antes da prova real NFS-e.

## 2. Segurança

- [x] A1 cifrado AES-256-GCM
- [x] SSRF/DNS rebinding protection
- [x] host/path restrictions para uso do A1
- [x] secrets bloqueados de Git/Docker
- [x] audit CI em severidade high
- [x] revisar logs para ausência de PFX, senhas, API keys e conteúdo sensível
- [x] track no-A1 restrito a TEST e incapaz de assinar/transmitir
- [ ] rotacionar qualquer segredo de ambiente de teste antes de piloto
- [ ] confirmar política operacional de retenção/eliminação de arquivos brutos e OCR antes de dados de piloto

## 3. Estado pré-A1

- [x] endpoint `POST /v1/operations/no-a1/validate`
- [x] ação no-A1 exposta diretamente na Console browser-only
- [x] readiness pré-certificado separado dos gates de certificado
- [x] `dps_builder_verified` corretamente tratado como gate pós-A1/pré-live, não como bloqueio do estado pré-certificado
- [x] Tax Decision persistida obrigatória para classificação fiscal final
- [x] DPS unsigned buildável e validável contra XSD oficial sem certificado
- [x] `transmitted=false`, `transmission_possible=false`, `certificate_used=false` invariantes do track no-A1
- [x] `valid=true` exige simultaneamente readiness pré-certificado, XSD válido e ausência de efeitos de assinatura/transmissão
- [x] produção hard-blocked no track no-A1
- [x] documentação `docs/PRE_A1_RELEASE.md`
- [ ] executar uma rodada operacional com Company TEST e obter `ready_without_certificate=true` — depende apenas do cadastro/inputs da Company, não de A1

## 4. Homologação real — bloqueio externo principal

Não declarar o TaxAgent homologado até concluir todos os itens abaixo com empresa e A1 reais em Produção Restrita.

- [ ] cadastrar/confirmar Company real
- [ ] upload A1 real pela Console
- [ ] validar certificado/chave/CNPJ/validade
- [ ] consultar parâmetros/convênio municipal
- [ ] criar Tax Decision `resolved`
- [ ] build DPS
- [ ] validar DPS contra XSD oficial
- [ ] assinar XML com A1
- [ ] validar XML assinado contra XSD oficial
- [ ] dry-run `valid=true` / `transmitted=false`
- [ ] promover builder para `verified`
- [ ] habilitar live somente no ambiente alvo
- [ ] transmitir primeira DPS em Produção Restrita
- [ ] receber autorização
- [ ] preservar XML autorizado + SHA-256
- [ ] registrar Fiscal Ledger
- [ ] receber/validar webhook
- [ ] repetir fluxo com sucesso sem intervenção extraordinária

## 5. Matriz mínima antes de pilotos

- [ ] 10–20 emissões reais de homologação repetíveis
- [ ] ao menos 3 cenários fiscais diferentes
- [ ] retenção de ISS quando aplicável
- [ ] operação sem retenção
- [x] erro/rejeição oficial normalizado no motor
- [x] retry/reconciliação desenhados para evitar retransmissão cega
- [x] consulta/reconciliação por DPS implementada para incerteza de transmissão
- [ ] cancelamento/evento homologado contra ambiente real
- [ ] Fiscal Inbox recebendo documento real
- [x] Document Intake XML implementado
- [x] PDF/foto OCR tratado como não autoritativo
- [x] pagamento parcial e múltiplos pagamentos por operação suportados pela camada de Economic Operations/Allocations
- [x] divergência de valor e contraparte gera finding/caso operacional

## 6. Observabilidade e operação

- [x] logs de runtime/deploy disponíveis no Render
- [x] jobs duráveis, retries e outbox persistentes
- [x] health endpoint e smoke tests de runtime/Docker no CI
- [ ] dashboard técnico consolidado de jobs/retries/webhooks — pós-prova real, antes de piloto amplo
- [ ] alertas operacionais finais — pós-prova real, antes de piloto amplo
- [x] runbook de homologação (`docs/HOMOLOGATION_RUNBOOK.md`)
- [ ] backup e restore do banco do ambiente de piloto testados antes de onboarding externo

## 7. Developer Experience

- [x] Swagger
- [x] browser homologation console
- [x] validação pré-A1 browser-only
- [x] documentação browser-only
- [x] documentação específica de estado pré-A1
- [x] contrato e testes do endpoint no-A1
- [ ] quickstart externo final — congelar somente depois da prova real para não documentar endpoints ainda sujeitos ao ciclo de homologação
- [ ] documentação comercial de webhooks/códigos de erro — congelar junto com API v0.1 após prova real
- [ ] changelog/versionamento inicial da API — após prova real

## 8. Produto/piloto

- [ ] escolher 10–20 empresas piloto
- [ ] escolher 2–3 parceiros ERP/SaaS
- [ ] definir onboarding técnico do piloto
- [ ] definir pricing piloto
- [ ] medir custo por documento/tenant
- [ ] medir taxa de automação sem intervenção
- [ ] registrar gaps por município/regime/cenário

## 9. Frontend/Netlify

Frontend de produto permanece propositalmente fora do caminho crítico até o motor concluir a homologação principal.

Quando o backend estiver fechado:

1. consolidar endpoints finais;
2. preparar dashboard/console operacional;
3. publicar uma atualização única no Netlify;
4. evitar múltiplos deploys parciais durante finalização do motor.

## Definition of Done pré-A1

O estado pré-A1 está tecnicamente fechado quando CI, migrations, isolamento de ambiente, Tax Decision, DPS/XSD e o track no-A1 estiverem íntegros, restando como dependência externa o certificado e os serviços oficiais que exigem mTLS/assinatura.

## Definition of Done do v0.1

O v0.1 só está finalizado/homologado quando o TaxAgent executar de ponta a ponta uma NFS-e Nacional real em Produção Restrita com A1 real, Tax Decision persistida, XML validado/assinado, autorização oficial, documentos preservados, Ledger registrado e webhook entregue — com repetibilidade e gates de segurança mantidos.
