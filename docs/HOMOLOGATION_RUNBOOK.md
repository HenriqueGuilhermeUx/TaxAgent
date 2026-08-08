# TaxAgent — Produção Restrita NFS-e Runbook

Este runbook é o caminho controlado para a primeira NFS-e real do TaxAgent no ambiente de Produção Restrita. Ele não contém certificado, senha, token ou outro segredo.

## Endpoints oficiais

- SEFIN Produção Restrita: `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional`
- SEFIN Produção: `https://sefin.nfse.gov.br/SefinNacional`
- Parâmetros Produção Restrita: `https://adn.producaorestrita.nfse.gov.br/parametrizacao/docs/index.html`
- ADN Contribuintes Produção Restrita: `https://adn.producaorestrita.nfse.gov.br/contribuintes/docs/index.html`

Por padrão o TaxAgent se recusa a apresentar o A1 a hosts diferentes dos endpoints oficiais da SEFIN. Um endpoint custom só pode ser usado com `TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS=true` e deve ser tratado como exceção de infraestrutura.

## Fase 1 — preparar sem transmitir

1. Subir PostgreSQL e executar `npm run db:migrate`.
2. Sincronizar os XSDs da Produção Restrita com `npm run schemas:sync -- --environment=test`.
3. Criar Organization e Company com CNPJ, IM (quando aplicável) e código IBGE do município emissor.
4. Criar API key de ambiente `test` com scopes necessários; para o preflight, incluir `operations:read` e `certificates:*` ou `*`.
5. Carregar o A1 pelo Certificate Vault. O Vault rejeita PFX sem chave privada, expirado ou ainda não válido.
6. Manter `TAXAGENT_NFSE_MODE=mock` e `TAXAGENT_LIVE_ENABLED=false`.
7. Consultar `GET /v1/operations/readiness/{companyId}?environment=test`.
8. Executar `POST /v1/operations/readiness/{companyId}/probe?environment=test`. O probe realiza handshake mTLS com a SEFIN e consulta o convênio municipal, mas **não envia DPS**.

## Fase 2 — homologar o DPS

1. Validar o DPS gerado contra o XSD sincronizado e os exemplos/regras oficiais vigentes.
2. Conferir `cIndOp`, `CST` e `cClassTrib` com o Tax Engine/dados oficiais aplicáveis.
3. Somente após a comparação e validação, definir `TAXAGENT_DPS_BUILDER_MODE=verified`.
4. Repetir readiness + probe. O campo `ready_to_enable_live` deve ser `true`.

## Fase 3 — primeira transmissão

1. Definir `TAXAGENT_NFSE_MODE=live`.
2. Definir `TAXAGENT_LIVE_ENABLED=true`.
3. Reiniciar API/worker com os segredos injetados pelo ambiente seguro.
4. Confirmar `ready_for_transmission=true` no readiness/probe.
5. Criar **uma** invoice de teste com dados conhecidos e classificação tributária validada.
6. Acompanhar invoice, attempts, fiscal ledger e documentos fiscais persistidos.
7. Se houver timeout, não crie manualmente outra operação até reconciliar a DPS original.

## Critério de sucesso

A primeira homologação só é considerada concluída quando o TaxAgent preserva:

- DPS enviada e seu hash;
- resposta da SEFIN;
- chave de acesso da NFS-e;
- XML autorizado;
- ledger de estados/tentativas;
- ausência de segredo/certificado em logs ou payloads de resposta.

Produção permanece bloqueada até repetirmos o processo de homologação, validarmos o layout efetivamente vigente em Produção e revisarmos os gates de segurança.
