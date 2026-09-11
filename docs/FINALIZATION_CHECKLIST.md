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
- [ ] rodada final de testes de integração para multi-payment/multi-document allocation
- [ ] revisar migrations 001..023 em banco limpo e em execução idempotente
- [ ] revisar queries SQL críticas que typecheck não valida

## 2. Segurança

- [x] A1 cifrado AES-256-GCM
- [x] SSRF/DNS rebinding protection
- [x] host/path restrictions para uso do A1
- [x] secrets bloqueados de Git/Docker
- [x] audit CI em severidade high
- [ ] revisar logs para ausência de PFX, senhas, API keys e conteúdo sensível
- [ ] rotacionar qualquer segredo de ambiente de teste antes de piloto
- [ ] confirmar política de retenção/eliminação de arquivos brutos e OCR

## 3. Homologação real — bloqueio principal

Não declarar o TaxAgent homologado até concluir todos os itens abaixo com empresa e A1 reais em Produção Restrita.

- [ ] cadastrar Company real
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

## 4. Matriz mínima antes de pilotos

- [ ] 10–20 emissões reais de homologação repetíveis
- [ ] ao menos 3 cenários fiscais diferentes
- [ ] retenção de ISS quando aplicável
- [ ] operação sem retenção
- [ ] erro/rejeição oficial normalizado
- [ ] retry após falha transitória sem duplicar emissão
- [ ] consulta/reconciliação por DPS após incerteza de transmissão
- [ ] cancelamento/evento homologado
- [ ] Fiscal Inbox recebendo documento real
- [ ] Document Intake XML real
- [ ] PDF/foto OCR tratado como não autoritativo
- [ ] pagamento parcial e múltiplos pagamentos por operação
- [ ] divergência de valor e contraparte gerando caso operacional

## 5. Observabilidade e operação

- [ ] dashboard técnico mínimo de jobs/retries/webhooks
- [ ] métricas de sucesso, rejeição e latência
- [ ] alertas para fila travada, webhook esgotado e transmissão inconclusiva
- [ ] runbook de incidente
- [ ] runbook de rollback/configuração de live gates
- [ ] backup e restore testados

## 6. Developer Experience

- [x] Swagger
- [x] browser homologation console
- [ ] exemplos curl/Node para fluxo principal
- [ ] coleção de requests ou quickstart de integração
- [ ] documentação completa de webhooks
- [ ] códigos de erro estáveis/documentados
- [ ] changelog/versionamento inicial da API

## 7. Produto/piloto

- [ ] escolher 10–20 empresas piloto
- [ ] escolher 2–3 parceiros ERP/SaaS
- [ ] definir onboarding técnico do piloto
- [ ] definir pricing piloto
- [ ] medir custo por documento/tenant
- [ ] medir taxa de automação sem intervenção
- [ ] registrar gaps por município/regime/cenário

## 8. Frontend/Netlify

Frontend de produto permanece propositalmente fora do caminho crítico até o motor concluir a homologação principal.

Quando o backend estiver fechado:

1. consolidar endpoints finais;
2. preparar dashboard/console operacional;
3. publicar uma atualização única no Netlify;
4. evitar múltiplos deploys parciais durante finalização do motor.

## Definition of Done do v0.1

O v0.1 está finalizado quando o TaxAgent executar de ponta a ponta uma NFS-e Nacional real em Produção Restrita com A1 real, Tax Decision persistida, XML validado/assinado, autorização oficial, documentos preservados, Ledger registrado e webhook entregue — com repetibilidade e gates de segurança mantidos.
