# TaxAgent — Product Brief

## O que é

TaxAgent é uma infraestrutura fiscal API-first para empresas de software, fintechs, ERPs, plataformas, escritórios contábeis e operações financeiras que precisam decidir, executar, armazenar e reconciliar obrigações fiscais brasileiras sem reconstruir um motor fiscal próprio.

O produto combina:

- NFS-e Nacional e Produção Restrita;
- Tax Engine IBS/CBS determinístico e versionado;
- Fiscal Router e parâmetros municipais;
- Certificate Vault A1;
- emissão, consulta, eventos e cancelamento;
- Fiscal Ledger e documentos imutáveis;
- Fiscal Inbox/ADN;
- Document Intake de XML/texto/PDF/foto com OCR opt-in;
- Payment Matching, Economic Operations e reconciliação financeira;
- webhooks, filas duráveis e APIs multi-tenant.

## Dor principal

A dor não é apenas "emitir nota". É transformar uma operação econômica em tratamento fiscal correto, executá-lo no canal oficial e preservar uma trilha auditável.

Problemas resolvidos:

1. fragmentação entre município, NFS-e Nacional, certificados, layouts e regras;
2. mudança contínua de schemas e regras fiscais;
3. risco de classificar cIndOp/CST/cClassTrib de forma ad hoc;
4. necessidade de operar A1/mTLS com segurança;
5. ausência de idempotência, retry e reconciliação robusta em integrações fiscais;
6. documentos fiscais espalhados e sem lineage confiável;
7. pagamentos que não fecham facilmente com documentos/operações;
8. sistemas que confundem evidência financeira com efeito tributário;
9. custo alto para cada SaaS/ERP/fintech manter seu próprio time fiscal + integração.

## Público-alvo

### ICP 1 — ERP/SaaS vertical
Sistemas para serviços, clínicas, imobiliárias, educação, logística, marketplaces, escritórios, construção, franquias e outros verticais que precisam embutir fiscal no produto.

### ICP 2 — Fintech / payments / banking-as-a-service
Empresas que já enxergam o fluxo financeiro e precisam ligar pagamento, documento, operação econômica e consequência fiscal.

### ICP 3 — Plataformas e marketplaces
Operações com muitos sellers/prestadores, alto volume, necessidade de emissão, eventos, reconciliação e auditoria.

### ICP 4 — Contabilidade e BPO fiscal
Escritórios que querem automatizar captura, classificação, conferência, divergências e operação fiscal para uma carteira de clientes.

### ICP 5 — Empresas médias com stack própria
Times financeiros/fiscais com ERP interno ou integrações customizadas que precisam reduzir manutenção de conectores e risco operacional.

## Proposta de valor

"Conecte sua operação uma vez. O TaxAgent decide o tratamento fiscal, executa no canal correto, guarda a evidência e devolve tudo por API e webhook."

A tese é ser uma camada de infraestrutura, não um emissor isolado.

## Monetização recomendada

Modelo híbrido B2B:

1. **Plataforma mensal** — cobrança por empresa/tenant ou faixa de uso, incluindo API, ambiente de teste, logs e suporte.
2. **Uso transacional** — preço por documento emitido/processado, evento, documento ingerido/OCR ou lote reconciliado.
3. **Tax Engine premium** — cobrança por decisão fiscal ou pacote de decisões/classificações com maior cobertura/regimes.
4. **Fiscal Inbox/Reconciliation** — módulo adicional por volume de documentos, pagamentos ou empresas monitoradas.
5. **Enterprise** — contrato anual com SLA, ambientes dedicados, suporte de implantação, SSO, retenção ampliada e integrações customizadas.
6. **Onboarding/implantação** — setup pago para ERP, fintech, marketplace ou contabilidade com integração complexa.

Evitar competir apenas por preço de NFS-e. O valor defensável está em decisão fiscal + execução + ledger + inbox + reconciliação + infraestrutura confiável.

## Exemplo de packaging inicial

- Developer: ambiente de teste + volume pequeno.
- Growth: mensalidade + franquia de documentos/decisões + excedente por uso.
- Scale: maior volume, webhooks, Inbox e reconciliação avançada.
- Enterprise: contrato anual, SLA, suporte e arquitetura dedicada.

Os valores devem ser calibrados depois dos primeiros pilotos reais; o objetivo inicial é validar disposição a pagar e custo operacional por tenant/documento.

## Moat esperado

- histórico de decisões fiscais versionadas;
- cobertura municipal e nacional acumulada;
- matriz de cenários/regimes testados;
- lineage completo entre operação, documento, pagamento, decisão e evento;
- datasets de rejeições/divergências e resolução;
- integração profunda com ERPs/fintechs;
- confiabilidade operacional e compliance.

## Métrica norte

Operações fiscais processadas corretamente sem intervenção humana, com decisão explicável, execução rastreável e evidência preservada.
