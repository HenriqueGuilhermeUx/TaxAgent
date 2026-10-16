# TaxAgent — Core NFS-e Emission Status

Atualizado em 2026-10-15.

## Resposta curta

**O core de emissão de NFS-e está implementado, mas a emissão real ainda não está comprovada ponta a ponta com uma autorização oficial repetível em Produção Restrita.**

Não confundir:

- `implemented`: código existe, é testado e está protegido por gates;
- `eligible`: uma Company específica possui rota/A1/conformidade suficientes para tentar homologação;
- `ready_for_transmission`: runtime + rede + gates estão verdes para uma tentativa autorizada;
- `authorized`: a SEFIN retornou NFS-e oficial com chave de acesso e XML autorizado preservado;
- `homologated`: o ciclo autorizado foi repetido com sucesso e cancelamento/eventos também foram comprovados.

Hoje o TaxAgent está entre **implemented** e **pilot/homologation-ready**, dependendo da Company. O marco `authorized/homologated` ainda exige prova externa real.

## O que já existe no core

- Tax Engine e Tax Decision persistida;
- roteamento fiscal por município/contribuinte;
- NFS-e Nacional nativa;
- adapter GISS separado;
- gateway long-tail protegido por capability lookup;
- XSD oficial e validação estrita;
- DPS builder;
- Certificate Vault A1;
- XMLDSig;
- mTLS;
- Prepared DPS imutável e idempotente;
- POST NFS-e Nacional;
- consulta/reconciliação por DPS;
- preservação de XML autorizado;
- Fiscal Ledger;
- webhooks;
- cancelamento via evento 101101;
- retry/reconciliação sem retransmissão cega.

## O que falta para dizer “emissão funcionando”

Para uma Company real de homologação:

1. CNPJ real cadastrado;
2. município emissor/rota real confirmados;
3. regime suportado pelo primeiro ciclo (`regular`);
4. A1 real, válido e vinculado ao mesmo CNPJ;
5. Tax Decision `resolved`;
6. `issuer-readiness` sem blockers;
7. `readiness/probe` com mTLS e parâmetros municipais verdes;
8. Prepared DPS criada com Idempotency-Key;
9. Prepared DPS assinada e XSD-validada;
10. runtime deliberadamente promovido para `TAXAGENT_NFSE_MODE=live`;
11. `TAXAGENT_LIVE_ENABLED=true` somente no ambiente alvo;
12. uma única transmissão autorizada em Produção Restrita;
13. status final `authorized`;
14. `access_key` oficial;
15. XML autorizado preservado + SHA-256;
16. Ledger/webhook confirmados;
17. repetição sem intervenção extraordinária;
18. cancelamento/evento 101101 comprovado no ambiente real.

## Fluxo obrigatório da primeira emissão

```
Company TEST real
→ issuer-readiness
→ readiness/probe
→ Tax Decision
→ POST /v1/operations/dps/prepare
→ POST /v1/operations/dps/prepared/:id/sign
→ readiness/probe novamente
→ habilitação explícita dos gates live
→ POST /v1/invoices com resume_payload da Prepared DPS
→ polling GET /v1/invoices/:id
→ authorized/rejected
→ documentos + ledger + webhook
```

A primeira emissão **não pode** reconstruir a DPS no momento do POST fiscal.

## Prova de sucesso

Aceite HTTP `202` em `POST /v1/invoices` **não prova emissão**.

Somente considerar uma NFS-e emitida quando:

- invoice estiver `authorized`;
- houver `access_key` oficial;
- XML autorizado estiver preservado;
- ledger registrar `invoice.authorized`.

## Estado dos gates padrão

Os defaults continuam deliberadamente fechados:

```
TAXAGENT_NFSE_MODE=mock
TAXAGENT_LIVE_ENABLED=false
PLUGNOTAS_SANDBOX_TRANSMISSION_ENABLED=false
PLUGNOTAS_PRODUCTION_TRANSMISSION_ENABLED=false
```

Isto é correto até uma Company legítima passar pelo preflight completo.

## GISS

A rota GISS não deve ser tratada como equivalente à NFS-e Nacional:

- consulta/reconciliação WSDL foi implementada;
- emissão `RecepcionarLoteRps` permanece separadamente bloqueada até prova de contrato/assinatura/resposta com contribuinte legítimo.

## Meta antes de venda ampla

- 10–20 emissões reais de homologação repetíveis;
- pelo menos 3 cenários fiscais;
- retenção de ISS quando aplicável;
- operação sem retenção;
- cancelamento/evento real;
- observabilidade operacional;
- backup/restore testados.

Até lá, a oferta correta é **piloto fiscal controlado**, não “emissão nacional homologada em qualquer município”.
