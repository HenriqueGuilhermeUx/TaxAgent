# TaxAgent v0.12 — Produção Restrita NFS-e Runbook

Este runbook é o caminho controlado para a primeira NFS-e real do TaxAgent em Produção Restrita. **Nunca cole A1, senha do A1, API key, master key ou bootstrap token em issues, PRs, chats ou logs.**

## Endpoints e schema protegidos

- SEFIN Produção Restrita: `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional`
- SEFIN Produção: `https://sefin.nfse.gov.br/SefinNacional`
- Schema Produção Restrita auditado: `NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20260727`
- SHA-256 pinado: `6c7e0510d3ecff4454f291f4e10b742d27a4818f23aab181494f96d0ea79f3dc`

O TaxAgent se recusa por padrão a apresentar a chave privada do A1 a host/path SEFIN diferente do oficial. `TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS=true` é uma exceção deliberada e não deve ser usada no primeiro ciclo.

O `schema-watch` baixa o ZIP oficial, confere o checksum, gera uma DPS com o próprio `DpsBuilderService`, valida o XML sem assinatura, gera um PFX efêmero, assina com o mesmo `XmlSignatureService` usado em produção e valida novamente o XML assinado contra o XSD oficial.

## Escopo do primeiro ciclo live

O builder v0.12 está deliberadamente limitado a:

- ambiente `test` / Produção Restrita para homologação;
- prestador CNPJ;
- `tax_regime=regular`;
- `national_service_code` / `cTribNac` com 6 dígitos;
- `service_location_city_code` explícito;
- `iss_taxation` (`tribISSQN`) explícito;
- `iss_withholding` (`tpRetISSQN`) explícito;
- `cIndOp`, `CST` e `cClassTrib` provenientes de uma `tax_decision_id` resolvida;
- A1 PKCS#12/PFX contendo certificado e chave privada correspondentes, dentro da validade e vinculado ao mesmo CNPJ da Company pelo OID ICP-Brasil `2.16.76.1.3.3`.

Simples Nacional e regimes especiais permanecem bloqueados até as regras específicas serem implementadas e homologadas.

## 0. Runtime seguro

Defina segredos no ambiente seguro e mantenha inicialmente:

```text
TAXAGENT_NFSE_MODE=mock
TAXAGENT_LIVE_ENABLED=false
TAXAGENT_DPS_BUILDER_MODE=draft
TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS=false
```

Execute:

```bash
npm run db:migrate
npm run db:migrate
npm run schemas:sync -- --environment=test
```

Confirme `GET /v1/health`.

## 1. Bootstrap da empresa

Defina localmente:

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

Guarde a `ta_test_*` exibida uma única vez fora do repositório.

## 2. A1 sem expor segredo

Defina:

```text
TAXAGENT_COMPANY_ID=<company id>
TAXAGENT_API_KEY=<ta_test_...>
TAXAGENT_A1_PATH=<caminho local do .pfx/.p12>
TAXAGENT_A1_PASSWORD_FILE=<arquivo local contendo somente a senha>
```

Execute:

```bash
npm run homologation:certificate
```

O Vault rejeita PFX sem chave privada, certificado expirado/não-válido, par certificado/chave incompatível, ausência do CNPJ ICP-Brasil ou CNPJ diferente da Company.

## 3. Preflight de rede — sem emitir

```bash
npm run homologation:preflight
```

O preflight faz readiness local, handshake mTLS com a SEFIN oficial e consulta parâmetros/convênio municipal. **Nenhuma DPS é enviada.**

## 4. Arquivo local da operação

Crie um JSON fora do controle de versão. Os scripts injetam `company_id`, `environment` e `tax_decision_id`.

```json
{
  "competence": "2026-08-08",
  "customer": {
    "tax_id": "<CPF ou CNPJ do tomador>",
    "name": "<nome do tomador>",
    "city_code": "<IBGE do endereco do tomador>"
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

Os códigos precisam representar a operação real; não copie valores de exemplo como classificação tributária.

Defina:

```text
TAXAGENT_HOMO_INVOICE_FILE=<caminho do JSON>
TAXAGENT_HOMO_TAX_TREATMENT=<standard|differentiated|special|unknown>
```

## 5. Resolver e persistir a decisão tributária

Execute:

```bash
npm run homologation:tax
```

O comando chama o Tax Engine e só libera o próximo passo se a decisão retornar `status=resolved`. Guarde localmente o ID retornado:

```text
TAXAGENT_TAX_DECISION_ID=<taxdec_...>
```

Live e o dry-run real recusam RTC digitado manualmente sem uma decisão persistida e resolvida.

## 6. DPS Dry Run — ainda sem SEFIN

Execute:

```bash
npm run homologation:dps
```

Fluxo:

```text
JSON real + tax decision
  -> Canonical Invoice
  -> DPS XML
  -> XSD oficial
  -> XMLDSig com A1 real
  -> XSD oficial novamente
  -> hashes SHA-256
```

A resposta precisa conter `valid=true`, `transmitted=false`, `tax_decision_id`, `dps_id`, schema, hashes e fingerprint do A1.

Se falhar, **não habilite live**.

## 7. Promover o builder

Somente depois do dry-run real verde e revisão do layout:

```text
TAXAGENT_DPS_BUILDER_MODE=verified
```

Reinicie a aplicação e rode novamente:

```bash
npm run homologation:preflight
```

`ready_to_enable_live` deve ser `true`.

## 8. Primeira DPS real na Produção Restrita

No runtime seguro:

```text
TAXAGENT_NFSE_MODE=live
TAXAGENT_LIVE_ENABLED=true
```

Reinicie e confirme `ready_for_transmission=true`.

Defina uma chave idempotente persistente e a confirmação exata:

```text
TAXAGENT_FIRST_INVOICE_IDEMPOTENCY_KEY=<valor unico>
TAXAGENT_CONFIRM_FIRST_TRANSMISSION=YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS
```

Execute **uma única vez**:

```bash
npm run homologation:first-invoice
```

O comando se recusa a enviar se readiness/probe não estiverem totalmente verdes.

## Retry fiscal

Depois que a DPS assinada é persistida:

1. o mesmo XML assinado é reutilizado byte a byte;
2. antes de retransmitir, o TaxAgent consulta `GET /dps/{id}`;
3. se a SEFIN já conhecer a DPS, o TaxAgent reconcilia o resultado;
4. só retransmite o mesmo XML quando o estado remoto indicar inexistência.

Não crie manualmente uma segunda invoice em caso de timeout.

## Critério de sucesso

A primeira homologação só é concluída quando o TaxAgent preserva e correlaciona:

- canonical input;
- `tax_decision_id` resolvida;
- identidade DPS de 45 caracteres;
- XML DPS assinado e SHA-256;
- tentativa/resposta SEFIN;
- chave de acesso;
- XML autorizado;
- fiscal ledger;
- ausência de PFX, senha, master key ou API key em logs/respostas.

Produção permanece bloqueada até repetir a validação usando o schema/layout efetivamente vigente em Produção.