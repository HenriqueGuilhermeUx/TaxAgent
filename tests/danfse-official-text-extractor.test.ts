import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOfficialDanfseTextFields } from '../src/danfse/danfse-official-text-extractor';

const fixture = `
DANFSe v2.0
Documento Auxiliar da NFS-e
NFS-e SEM VALIDADE JURÍDICA
CHAVE DE ACESSO DA NFS-E
00012345678901234567890123456789012345678901234567
NÚMERO DA NFS-E
000000123
COMPETÊNCIA DA NFS-E
19/11/2026
DATA E HORA DA EMISSÃO DA NFS-E
19/11/2026 10:00:00
PRESTADOR / FORNECEDOR
CNPJ / CPF / NIF
12.345.678/0001-90
Nome / Nome Empresarial
Prestador Exemplo Ltda
TOMADOR / ADQUIRENTE
CNPJ / CPF / NIF
98.765.432/0001-10
Nome / Nome Empresarial
Cliente Exemplo S.A.
SERVIÇO PRESTADO
Código de Tributação Nacional / Municipal
010101 / 0007
Código da NBS
114011900
Descrição do Serviço
Consultoria empresarial especializada
TRIBUTAÇÃO MUNICIPAL (ISSQN)
BC ISSQN
R$ 1.000,00
Alíquota Aplicada
5,0000 %
ISSQN Apurado
R$ 50,00
TRIBUTAÇÃO IBS / CBS
CST / cClassTrib
000 / 000001
Base de Cálculo Após Exclusões e Reduções
R$ 1.000,00
Alíquota IBS UF / IBS Mun
0,1000 % / 0,0000 %
Valor Apurado Municipal - IBS
R$ 0,00
Valor Apurado Estadual - IBS
R$ 1,00
Valor Total Apurado - IBS
R$ 1,00
Alíquota - CBS
0,9000 %
Valor Total Apurado - CBS
R$ 9,00
VALOR TOTAL DA NFS-E
VALOR DA OPERAÇÃO / SERVIÇO
R$ 1.000,00
Total das Retenções (ISSQN / Federais)
R$ 0,00
VALOR LÍQUIDO DA NFS-e
R$ 950,00
Total do IBS/CBS
R$ 10,00
VALOR LÍQUIDO DA NFS-e + IBS/CBS
R$ 1.010,00
`;

test('official-label extractor returns only bounded semantic fields', () => {
  const result = extractOfficialDanfseTextFields(fixture);
  assert.equal(result.extractionVersion, 'official-labels-1.0.0');
  assert.equal(result.fields['document.environment'], 'test');
  assert.equal(result.fields['document.access_key'], '00012345678901234567890123456789012345678901234567');
  assert.equal(result.fields['document.number'], '000000123');
  assert.equal(result.fields['provider.tax_id'], '12.345.678/0001-90');
  assert.equal(result.fields['customer.tax_id'], '98.765.432/0001-10');
  assert.equal(result.fields['service.national_code'], '010101');
  assert.equal(result.fields['service.municipal_code'], '0007');
  assert.equal(result.fields['service.nbs'], '114011900');
  assert.equal(result.fields['iss.base'], '1000.00');
  assert.equal(result.fields['iss.rate'], '5.0000');
  assert.equal(result.fields['iss.amount'], '50.00');
  assert.equal(result.fields['ibs_cbs.base'], '1000.00');
  assert.equal(result.fields['ibs_cbs.rates'], '0.1000 / 0.0000 / 0.9000');
  assert.equal(result.fields['ibs_cbs.state_amount'], '1.00');
  assert.equal(result.fields['ibs_cbs.municipal_amount'], '0.00');
  assert.equal(result.fields['ibs_cbs.ibs_total'], '1.00');
  assert.equal(result.fields['ibs_cbs.cbs_total'], '9.00');
  assert.equal(result.fields['totals.service'], '1000.00');
  assert.equal(result.fields['totals.retentions'], '0.00');
  assert.equal(result.fields['totals.net'], '950.00');
  assert.equal(result.fields['totals.net_plus_ibs_cbs'], '1010.00');
  assert.deepEqual(result.ambiguousFields, []);
});

test('official-label extractor preserves leading zero codes', () => {
  const result = extractOfficialDanfseTextFields(fixture);
  assert.equal(result.fields['service.municipal_code'], '0007');
  assert.equal(result.fields['document.number'], '000000123');
});

test('duplicate conflicting values in one party section become ambiguity without choosing a taxpayer id', () => {
  const text = fixture.replace(
    'Nome / Nome Empresarial\nPrestador Exemplo Ltda',
    'CNPJ / CPF / NIF\n11.111.111/0001-11\nNome / Nome Empresarial\nPrestador Exemplo Ltda',
  );
  const result = extractOfficialDanfseTextFields(text);
  assert.equal(result.fields['provider.tax_id'], undefined);
  assert.equal(result.ambiguousFields?.includes('provider.tax_id'), true);
});

test('absence of homologation marker never infers production', () => {
  const result = extractOfficialDanfseTextFields(fixture.replace('NFS-e SEM VALIDADE JURÍDICA\n', ''));
  assert.equal(result.fields['document.environment'], undefined);
});

test('unknown text and apparent secrets are not copied into the bounded result', () => {
  const result = extractOfficialDanfseTextFields(`${fixture}\nTOKEN SUPER-SECRETO\nabcdef123456\n`);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('SUPER-SECRETO'), false);
  assert.equal(serialized.includes('abcdef123456'), false);
});
