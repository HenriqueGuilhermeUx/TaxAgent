# TaxAgent — Commercial Pilot Runbook V1

## Objetivo

Transformar um lead do site em um piloto fiscal TEST rastreável, sem misturar qualificação comercial com autorização de transmissão.

Fluxo oficial:

```
taxagent.com.br
→ commercial_pilot_applications
→ contato
→ qualified
→ convert-to-pilot
→ Company + Pilot Enrollment TEST
→ onboarding/readiness
→ A1/IM/credencial quando a rota exigir
→ preflight seguro
→ HOMOLOGATION_READY
→ teste fiscal somente com autorização explícita
```

A conversão comercial **nunca** habilita live mode, transmissão ou emissão.

## Critério mínimo de qualificação

Antes de converter uma aplicação:

- contato e empresa identificados;
- uso pretendido entendido;
- CNPJ/CPF confirmado;
- município emissor confirmado por código IBGE;
- regime fiscal informado/confirmado;
- responsável ciente de que o piloto começa em TEST/homologação;
- nenhuma senha, A1 ou credencial municipal recebida por e-mail/formulário comercial.

Quando a aplicação não atender esses requisitos, manter em `new`/`contacted` ou rejeitar.

## Operação pelo navegador

Console interno:

`GET /v1/commercial/pilots`

O Bootstrap Token é informado somente em memória na aba e não deve ser armazenado em localStorage/sessionStorage.

Ações:

1. carregar fila;
2. marcar `contacted`;
3. marcar `qualified`;
4. informar dados fiscais mínimos;
5. criar Pilot Enrollment TEST;
6. revisar blockers/checklist retornados;
7. seguir onboarding normal da Company.

## API de gestão

- `GET /v1/commercial/pilot-applications`
- `POST /v1/commercial/pilot-applications/:id/status`
- `POST /v1/commercial/pilot-applications/:id/convert-to-pilot`

Todas as rotas de gestão exigem Bootstrap Guard.

## Idempotência

A conversão reutiliza a Company por tax_id através do PilotEnrollmentService e faz upsert do Pilot Enrollment. Após o vínculo da aplicação a `company_id` + `enrollment_id`, novas tentativas retornam a mesma conversão.

Se a criação da Company/Pilot Enrollment concluir mas o update comercial falhar, uma nova tentativa deve recuperar/reutilizar o mesmo tenant pelo tax_id.

## Dados sensíveis

O funil comercial não aceita:

- PFX/P12;
- senha de A1;
- usuário/senha municipal;
- tokens de provedor;
- API keys;
- arquivos fiscais brutos.

Esses dados entram somente pelos cofres/rotas específicas do onboarding fiscal.

## Critérios de sucesso do piloto

Antes de chamar uma empresa de piloto operacional:

1. onboarding atualizado e fingerprint atual;
2. A1 válido e correspondente ao CNPJ, quando exigido;
3. rota fiscal resolvida;
4. preflight concluído;
5. Tax Decision persistida;
6. DPS válida no XSD oficial;
7. transmissão real somente depois de autorização explícita;
8. evidência/documentos preservados;
9. repetir o fluxo sem intervenção extraordinária.

Meta antes de piloto amplo: 10–20 emissões de homologação repetíveis, ao menos 3 cenários fiscais e cancelamento/evento homologado.

## Pricing

Não fixar preço público antes de medir:

- custo por documento;
- custo por tenant;
- custo por rota/provedor;
- taxa de automação sem intervenção;
- custo de suporte/homologação por empresa.

Até essa medição, a oferta comercial deve ser apresentada como **piloto controlado**, com escopo e condições acordados caso a caso.

## Safeguards

- ambiente de conversão: TEST;
- live mode: não alterado;
- transmissão: não habilitada;
- emissão: não iniciada;
- Produção: fora deste fluxo.
