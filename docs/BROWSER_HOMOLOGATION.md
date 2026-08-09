# TaxAgent — Homologação 100% pelo navegador

Este fluxo existe para operar a primeira homologação NFS-e Nacional sem PowerShell, terminal ou conversão manual de certificado.

## 1. O que você precisa ter em mãos

### Dados da empresa emissora

Use documentos cadastrais da própria empresa e confirme com o contador quando houver dúvida:

- **Razão social**: Cartão CNPJ / contrato social / cadastro contábil.
- **CNPJ**: Cartão CNPJ e também presente no certificado A1 da pessoa jurídica.
- **Código IBGE do município**: município do estabelecimento emissor, em 7 dígitos.
- **Inscrição Municipal (IM)**: cadastro mobiliário municipal / prefeitura / contador. Alguns cenários podem não exigir preenchimento, mas o dado deve ser conhecido.
- **Regime tributário**: contador. O primeiro ciclo live do TaxAgent está deliberadamente limitado a `regular`.

### Certificado A1

O A1 é um arquivo privado da própria empresa, normalmente `.pfx` ou `.p12`, acompanhado de uma senha.

Pode estar com:

- responsável legal/administrativo da empresa;
- contador;
- equipe de TI;
- certificadora que emitiu o certificado.

**Não envie o PFX/P12 nem sua senha por chat, e-mail, issue ou GitHub.** O upload deve ser feito diretamente do computador que contém o arquivo para a Console de Homologação.

### Dados da operação de teste

Para a primeira NFS-e, tenha uma prestação de serviço real/representativa com:

- CPF/CNPJ do tomador;
- nome/razão social do tomador;
- município IBGE do tomador;
- descrição do serviço;
- valor;
- município da prestação;
- tratamento de ISS/retenção aplicável;
- cTribNac;
- cIndOp;
- CST IBS/CBS;
- cClassTrib.

Os códigos fiscais não devem ser copiados de exemplos. Devem representar a operação e serão vinculados a uma `tax_decision` persistida antes do dry-run/live.

## 2. Deploy pelo painel do Render

O repositório contém `render.yaml` para criar:

- Web Service Docker `taxagent-homologation`;
- PostgreSQL 17 `taxagent-homologation-db`;
- `DATABASE_URL` ligada ao banco;
- `TAXAGENT_MASTER_KEY_B64` gerada automaticamente;
- `TAXAGENT_BOOTSTRAP_TOKEN` gerado automaticamente;
- live desligado por padrão.

No Render Dashboard:

1. escolha **New > Blueprint**;
2. conecte `HenriqueGuilhermeUx/TaxAgent`;
3. selecione a branch `agent/engine-v0.1` enquanto o PR permanecer Draft;
4. confirme o Blueprint `render.yaml`;
5. aguarde Web Service e Postgres ficarem disponíveis;
6. abra o Web Service e copie a URL `https://...onrender.com`;
7. em **Environment**, consulte o valor do `TAXAGENT_BOOTSTRAP_TOKEN` para usar somente durante o bootstrap da empresa.

Não altere ainda:

- `TAXAGENT_NFSE_MODE=mock`;
- `TAXAGENT_LIVE_ENABLED=false`;
- `TAXAGENT_DPS_BUILDER_MODE=draft`.

## 3. Abrir a Console

Com a API online:

- Console: `https://SEU-SERVICO.onrender.com/v1/homologation`
- Swagger: `https://SEU-SERVICO.onrender.com/docs`
- Health: `https://SEU-SERVICO.onrender.com/v1/health`

A Console não usa `localStorage` nem `sessionStorage`. Bootstrap token, API key e senha do A1 ficam apenas na memória da aba e são perdidos ao recarregar.

## 4. Wizard da Console

### Passo 0 — sessão

Informe o `TAXAGENT_BOOTSTRAP_TOKEN` obtido no painel do Render.

Se já houver Company/API key, use os campos de retomada em vez de criar outra empresa.

### Passo 1 — empresa

Preencha razão social, CNPJ, código IBGE, IM e regime tributário.

A Console cria:

1. Organization;
2. Company;
3. API key `ta_test_*` com escopo de homologação.

A API key é mostrada uma única vez. Copie e guarde em local seguro.

### Passo 2 — A1

Escolha diretamente o `.pfx/.p12` no seletor de arquivos e informe a senha.

O backend valida antes de armazenar:

- PKCS#12 legível;
- existência de chave privada;
- chave privada correspondente ao certificado;
- período de validade;
- CNPJ ICP-Brasil do certificado;
- correspondência entre CNPJ do A1 e CNPJ da Company.

Somente depois o PFX e a senha são cifrados no Certificate Vault.

### Passo 3 — preflight

O botão de preflight não emite nota. Ele verifica readiness local, handshake mTLS com a SEFIN configurada e parâmetros/convênio do município.

### Passo 4 — Tax Decision

Informe os dados/códigos fiscais da operação. Uma decisão só pode ser vinculada ao live/dry-run se retornar `status=resolved`.

### Passo 5 — DPS dry-run

A Console executa:

`operação -> tax_decision -> DPS -> XSD oficial -> A1/XMLDSig -> XSD oficial`

O resultado esperado é:

- `valid: true`;
- `transmitted: false`;
- `dps_id`;
- hashes SHA-256;
- fingerprint do A1.

Nenhuma DPS é enviada nessa etapa.

### Passo 6 — primeira transmissão

Só avançar após revisão do dry-run e readiness. O botão exige:

- dry-run válido na mesma aba;
- `ready_for_transmission=true`;
- uma `Idempotency-Key` única;
- confirmação exata `YES-I-UNDERSTAND-THIS-SENDS-A-REAL-DPS`;
- runtime explicitamente promovido para os gates live.

## 5. O que compartilhar no chat durante a homologação

Pode compartilhar:

- razão social;
- CNPJ, se você decidir que é apropriado para o teste;
- município/código IBGE;
- IM, se apropriado;
- regime tributário;
- mensagens de erro sem segredos;
- resultados de readiness/preflight/dry-run, revisando antes se houver algum dado que não queira compartilhar.

Não compartilhar:

- arquivo `.pfx/.p12`;
- senha do A1;
- `TAXAGENT_MASTER_KEY_B64`;
- `TAXAGENT_BOOTSTRAP_TOKEN`;
- API key `ta_test_*` ou `ta_live_*`;
- credenciais do Postgres.

## 6. Diferença importante: NFS-e x NF-e

O primeiro ciclo do TaxAgent é **NFS-e Nacional para serviços**. NF-e de mercadorias virá como outro provider/documento e exigirá campos próprios como IE, NCM, CFOP, ICMS, IPI e itens de produto. Não misture esses dados na primeira homologação NFS-e.
