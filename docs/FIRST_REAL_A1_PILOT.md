# Primeiro piloto A1 real — perfil recomendado

## Objetivo

Provar a emissão Nacional em Produção Restrita com o menor número possível de variáveis fiscais e municipais.

## Empresa recomendada

- pessoa jurídica prestadora de serviços estabelecida em **Belo Horizonte/MG**;
- CNPJ ativo;
- inscrição municipal ativa em Belo Horizonte;
- regime tributário **fora do Simples Nacional**, preferencialmente **Lucro Presumido** para o primeiro ciclo;
- sem regime especial de ISS;
- sem imunidade/isenção/suspensão;
- certificado **e-CNPJ A1** PKCS#12/PFX, válido e contendo o mesmo CNPJ da Company;
- atividade real compatível com **assessoria/consultoria empresarial**.

## Serviço do primeiro cenário

Perfil TaxAgent: `business_consulting`

Classificação controlada:

- cTribNac: `170101`
- NBS: `114011900`
- cIndOp: `100301`
- CST: `000`
- cClassTrib: `000001`
- tratamento: `standard`
- ISS item municipal: `17.01`
- ISS taxation: `1`
- ISS withholding: `1` (não retido), somente se o fato real confirmar não retenção
- alíquota ISS BH para o perfil padrão: `5%`
- município de incidência: Belo Horizonte (`3106200`) no cenário padrão do item 17.01.

## Cenário preferido

Primeira nota de homologação:

- prestador: empresa piloto de BH;
- tomador: pessoa jurídica brasileira identificada;
- prestação: consultoria empresarial comum;
- local/incidência: Belo Horizonte;
- valor pequeno e realista;
- sem desconto;
- sem intermediário;
- sem retenção de ISS;
- sem benefício municipal;
- sem regime especial;
- sem operação no exterior.

Não usar um cenário artificial se ele não corresponder à operação real da empresa.

## Por que Belo Horizonte

Belo Horizonte migrou as pessoas jurídicas prestadoras para o Emissor Nacional, reduzindo a ambiguidade entre emissor municipal e SEFIN Nacional no primeiro teste.

## O que não usar no primeiro ciclo

- MEI;
- Simples Nacional;
- Santos/GISS;
- município cuja empresa ainda emita normalmente em emissor municipal próprio;
- construção civil;
- saúde com regime particular;
- exportação de serviços;
- retenção de ISS no primeiro cenário;
- imunidade/isenção;
- decisão administrativa/judicial;
- operação com município de incidência diferente do estabelecimento do prestador.

## Dados/artefatos necessários

1. razão social;
2. CNPJ;
3. código IBGE do estabelecimento;
4. inscrição municipal;
5. regime tributário real;
6. A1 PFX/P12 + senha pelo upload seguro do TaxAgent;
7. CNAE/atividade principal e descrição do serviço real;
8. dados do tomador;
9. valor da operação;
10. confirmação de retenção de ISS;
11. confirmação do município de incidência.

## Gates da primeira transmissão

Company TEST
→ Tax Decision resolved
→ issuer-readiness
→ readiness/probe
→ Prepared DPS
→ XSD
→ A1/XMLDSig
→ XSD assinado
→ fingerprint A1 consistente
→ one-shot transmission permit
→ uma transmissão Produção Restrita
→ authorized
→ access_key
→ XML autorizado
→ Ledger
→ webhook
→ cancelamento/evento
→ repetição.

Produção fiscal real permanece fora deste piloto.
