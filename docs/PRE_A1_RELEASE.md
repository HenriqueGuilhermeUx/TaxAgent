# TaxAgent v0.1 — estado pré-A1

Este documento congela o estado técnico que pode ser validado antes de existir um certificado A1 real.

## Objetivo

Chegar ao ponto em que o único bloqueio para a prova oficial seja externo: certificado A1 válido + acesso à SEFIN em Produção Restrita.

O TaxAgent não deve ser declarado homologado em Produção Restrita antes da prova real com A1. O estado descrito aqui é **pré-A1 pronto para homologação**, não homologação fiscal concluída.

## Gate oficial sem A1

Endpoint:

`POST /v1/operations/no-a1/validate`

Este endpoint é restrito a `environment=test` e deliberadamente:

- não carrega certificado;
- não assina XML;
- não abre sessão mTLS usando certificado do contribuinte;
- não transmite DPS;
- não chama a SEFIN para emissão;
- não habilita gates live.

Ele valida o que pode ser provado antes do certificado:

1. Company e contexto fiscal;
2. readiness pré-certificado;
3. Tax Decision persistida e `resolved`;
4. construção da DPS;
5. validação da DPS contra o XSD oficial ativo;
6. integridade/hash do XML não assinado;
7. separação explícita dos gates que ainda dependem do A1.

## Resultado esperado

Uma execução pronta para receber o A1 deve retornar, entre outros campos:

```json
{
  "valid": true,
  "track": "no-a1",
  "environment": "test",
  "transmitted": false,
  "transmission_possible": false,
  "certificate_used": false,
  "certificate_required_for_next_stage": true,
  "ready_without_certificate": true,
  "failed_before_certificate": []
}
```

`ready_without_certificate=true` significa somente que todos os gates bloqueantes anteriores ao certificado passaram.

## Fluxo browser-only enquanto não há A1

A Console técnica permanece em:

`GET /v1/homologation`

E o Swagger em:

`GET /docs`

Sequência segura pela própria Console:

1. criar ou retomar uma Company TEST;
2. usar uma API key TEST;
3. resolver uma Tax Decision;
4. preencher os dados da DPS;
5. clicar **Validar pré-A1 · Tax Decision → DPS → XSD**;
6. exigir `valid=true`, `ready_without_certificate=true`, `transmitted=false` e `certificate_used=false`;
7. preservar o resultado como evidência técnica da rodada.

O Swagger continua disponível para inspeção direta do mesmo endpoint, mas não é necessário para o fluxo normal browser-only.

Nunca colocar bootstrap token, API key, PFX/P12, senha do certificado ou master key em chat, issue, commit ou log.

## O que fica bloqueado até existir A1

Somente a fase que tecnicamente depende do certificado:

- validar PFX/P12, chave privada, validade e vínculo com o CNPJ da Company;
- XMLDSig da DPS exata;
- validação do XML assinado contra XSD oficial;
- handshake mTLS real;
- dry-run completo com certificado;
- promoção controlada do builder/gates;
- primeira transmissão em Produção Restrita;
- autorização oficial;
- preservação do XML autorizado + SHA-256;
- Fiscal Ledger e webhook da operação real;
- repetição do cenário em matriz de homologação.

## Invariantes de segurança

Enquanto o A1 não existir:

- `TAXAGENT_LIVE_ENABLED=false`;
- `TAXAGENT_NFSE_MODE=mock` por padrão;
- `TAXAGENT_DPS_BUILDER_MODE=draft` por padrão;
- o PR de release permanece Draft;
- não promover o builder para `verified` com base apenas no track no-A1;
- não confundir XSD válido com autorização fiscal;
- extrações OCR/PDF continuam não autoritativas;
- evidência financeira não cria automaticamente efeitos IBS/CBS.

## Hardening fechado antes do A1

- migrations idempotentes em PostgreSQL real;
- TLS PostgreSQL com semântica explícita;
- isolamento multi-tenant e por ambiente;
- Payment Matching com confirmação/evidência idempotente e verificável;
- Tax Position separada por `company_id + environment`;
- allocations com replacement correto e split de pagamento sem ponteiro legado ambíguo;
- XSD oficial pinado e validado no CI;
- testes de no-A1 impedindo assinatura/transmissão e bloqueando `production`;
- ação no-A1 exposta na Console e coberta por teste de UI;
- Docker final executado no CI.

## Quando o A1 chegar

Executar, nesta ordem:

`Company real → upload A1 → validação chave/CNPJ/validade → preflight municipal/mTLS → Tax Decision resolved → DPS → XSD → XMLDSig → XSD assinado → dry-run valid=true/transmitted=false → revisão → gates live somente no ambiente alvo → UMA transmissão Produção Restrita → autorização → XML/SHA-256 → Fiscal Ledger → webhook → repetição.`

A primeira transmissão real nunca deve ser usada como teste de configuração básica.

## Netlify

O frontend/dashboard de produto continua fora do caminho crítico. A atualização do Netlify deve ser única e consolidada depois da prova real do backend, conforme a estratégia de finalização já definida.
