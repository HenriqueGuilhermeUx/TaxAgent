# TaxAgent v0.12 — Produção Restrita NFS-e Runbook

Este runbook é o caminho controlado para a primeira NFS-e real do TaxAgent no ambiente de Produção Restrita. **Nunca cole A1, senha do A1, API key, master key ou bootstrap token em issues, PRs, chats ou logs.**

## Endpoints oficiais protegidos

- SEFIN Produção Restrita: `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional`
- SEFIN Produção: `https://sefin.nfse.gov.br/SefinNacional`
- Parâmetros Produção Restrita: `https://adn.producaorestrita.nfse.gov.br/parametrizacao/docs/index.html`
- ADN Contribuintes Produção Restrita: `https://adn.producaorestrita.nfse.gov.br/contribuintes/docs/index.html`

O TaxAgent se recusa, por padrão, a apresentar a chave privada do A1 a host SEFIN diferente do oficial. `TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS=true` existe apenas para infraestrutura privada explicitamente confiável e não deve ser habilitado no primeiro ciclo.

## Pré-requisitos do primeiro ciclo

O builder live v0.12 está deliberadamente limitado a:

- ambiente `test` / Produção Restrita para homologação;
- prestador CNPJ;
- `tax_regime=regular`;
- `national_service_code` / `cTribNac` com 6 dígitos;
- `service_location_city_code` explícito;
- `iss_taxation` (`tribISSQN`) explícito;
- `iss_withholding` (`tpRetISSQN`) explícito;
- `cIndOp`, `CST` e `cClassTrib` completos e previamente validados;
- A1 PKCS#12/PFX contendo certificado e chave privada e dentro da validade.

Simples Nacional e regimes especiais permanecem bloqueados até o TaxAgent implementar e homologar suas regras específicas de documento. Isso é um guardrail, não uma limitação arquitetural.

## Fase 0 — runtime seguro

1. Gerar `TAXAGENT_MASTER_KEY_B64` com 32 bytes aleatórios e guardar em secret manager.
2. Definir `TAXAGENT_BOOTSTRAP_TOKEN` forte.
3. Manter:
   - `TAXAGENT_NFSE_MODE=mock`
   - `TAXAGENT_LIVE_ENABLED=false`
   - `TAXAGENT_DPS_BUILDER_MODE=draft`
   - `TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS=false`
4. Subir PostgreSQL e API.
5. Executar migrations duas vezes para confirmar idempotência:

```bash
npm run db:migrate
npm run db:migrate
```

6. Confirmar `GET /v1/health`.

## Fase 1 — schemas oficiais da Produção Restrita

Sincronizar somente o ambiente de teste:

```bash
npm run schemas:sync -- --environment=test
```

O sincronizador:

- baixa o ZIP indicado pelo registry oficial do TaxAgent;
- calcula SHA-256 do arquivo;
- protege contra path traversal no ZIP;
- identifica o XSD raiz da DPS;
- grava `manifest.json` com origem, hash e arquivos extraídos.

Não marque o builder como `verified` apenas porque o download foi concluído.

## Fase 2 — bootstrap da empresa de homologação

Defina localmente as variáveis não secretas e o bootstrap token, por exemplo:

```text
TAXAGENT_HOMO_COMPANY_NAME=<razao social>
TAXAGENT_HOMO_TAX_ID=<cnpj>
TAXAGENT_HOMO_CITY_CODE=<codigo IBGE 7 digitos>
TAXAGENT_HOMO_MUNICIPAL_REGISTRATION=<IM, se aplicavel>
TAXAGENT_HOMO_TAX_REGIME=regular
```

Execute:

```bash
npm run homologation:bootstrap
```

O comando cria Organization, Company e uma `ta_test_*`. A API key é exibida **uma única vez**. Guarde-a fora do repositório.

## Fase 3 — A1 sem expor segredo

No computador/servidor que contém o arquivo A1:

```text
TAXAGENT_COMPANY_ID=<company id>
TAXAGENT_API_KEY=<ta_test_...>
TAXAGENT_A1_PATH=<caminho local para .pfx/.p12>
TAXAGENT_A1_PASSWORD_FILE=<arquivo local contendo somente a senha>
```

Execute:

```bash
npm run homologation:certificate
```

O script lê o PFX do disco e envia diretamente ao Certificate Vault. Ele não imprime PFX nem senha. O Vault rejeita certificado sem chave privada, expirado ou ainda não válido.

## Fase 4 — preflight de rede, sem emissão

```bash
npm run homologation:preflight
```

O preflight executa:

1. readiness local;
2. handshake mTLS com a SEFIN oficial usando o A1;
3. consulta dos parâmetros/convênio do município emissor.

**Nenhuma DPS é enviada.**

Nesse momento `dps_builder_verified` ainda pode estar vermelho — isso é esperado.

## Fase 5 — arquivo de operação de homologação

Crie um JSON local fora do controle de versão. Não inclua `company_id` nem `environment`; os scripts injetam esses campos.

Estrutura mínima do primeiro cenário suportado:

```json
{
  "competence": "2026-08-08",
  "customer": {
    "tax_id": "<CPF ou CNPJ do tomador>",
    "name": "<nome do tomador>",
    "city_code": "<IBGE do endereço do tomador>"
  },
  "service": {
    "description": "<descricao real do servico>",
    "amount": 100.00,
    "national_service_code": "<cTribNac 6 digitos>",
    "service_location_city_code": "<IBGE do local da prestacao>",
    "iss_taxation": "<1|2|3|4>",
    "iss_withholding": "<1|2|3>",
    "iss_rate": 5.00,
    "operation_indicator": "<cIndOp 6 digitos>",
    "tax_situation": "<CST IBS/CBS 3 digitos>",
    "tax_classification": "<cClassTrib 6 digitos>"
  }
}
```

Os códigos devem ser determinados para a operação real; **não copie valores de exemplo como se fossem classificação tributária.**

Defina:

```text
TAXAGENT_HOMO_INVOICE_FILE=<caminho desse JSON>
```

## Fase 6 — DPS Dry Run, ainda sem SEFIN

Execute:

```bash
npm run homologation:dps
```

Esse comando faz:

```text
JSON real
  -> Canonical Invoice
  -> DPS XML
  -> XSD oficial
  -> assinatura XMLDSig com A1
  -> XSD oficial novamente
  -> hashes SHA-256
```

A resposta deve conter:

- `valid=true`;
- `transmitted=false`;
- `dps_id`;
- `schema`;
- hash do XML sem assinatura;
- hash do XML assinado;
- fingerprint do A1.

Se esse passo falhar, **não habilite live**. Corrija o builder/dados até o XML passar no XSD vigente.

## Fase 7 — promover o builder

Somente depois do dry-run e da revisão do layout:

```text
TAXAGENT_DPS_BUILDER_MODE=verified
```

Reinicie a aplicação e execute novamente:

```bash
npm run homologation:preflight
```

`ready_to_enable_live` deve ser `true`.

## Fase 8 — primeira DPS real na Produção Restrita

Habilite no runtime seguro:

```text
TAXAGENT_NFSE_MODE=live
TAXAGENT_LIVE_ENABLED=true
```

Reinicie API/worker e confirme que o probe retorna `ready_for_transmission=true`.

Defina uma chave idempotente única e a confirmação exata:

```text
TAXAGENT_FIRST_INVOICE_IDEMPOTENCY_KEY=<valor unico e persistente>
TAXAGENT_CONFIRM_FIRST_TRANSMISSION=YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS
```

Então execute **uma única vez**:

```bash
npm run homologation:first-invoice
```

O comando se recusa a enviar se readiness/probe não estiverem completamente verdes.

## Semântica de retry

Uma invoice recebe `issuedAt`, competência e identidade da DPS de forma estável. Depois que o XML assinado é persistido:

1. qualquer retry reutiliza o mesmo XML assinado;
2. antes de retransmitir, o TaxAgent chama `GET /dps/{id}`;
3. se a SEFIN já conhecer a DPS, o TaxAgent reconcilia o resultado;
4. só retransmite o mesmo XML se o estado remoto indicar DPS inexistente.

Não crie manualmente uma segunda invoice em caso de timeout.

## Critério de sucesso

A primeira homologação só é concluída quando o TaxAgent preserva e consegue correlacionar:

- canonical input;
- identidade DPS de 45 caracteres;
- XML DPS assinado e SHA-256;
- tentativa e resposta SEFIN;
- chave de acesso;
- XML autorizado;
- fiscal ledger;
- ausência de PFX, senha, master key ou API key em logs/respostas.

Produção permanece bloqueada até repetirmos a validação usando o schema/layout efetivamente vigente em Produção e revisarmos os gates de segurança.