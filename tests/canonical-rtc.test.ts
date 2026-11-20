import assert from 'node:assert/strict';
import test from 'node:test';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { mapCanonicalRegular, mapCanonicalSimples } from '../src/official-rtc/canonical-rtc.mapper';
import { normalizeCanonicalSimplesActivityCompatibility } from '../src/official-rtc/canonical-rtc.service';

test('maps canonical 2026 regular NFS-e to the pinned Receita contract without nominal rates', () => {
  const mapped = mapCanonicalRegular({
    operation_id: '6194602ea71cbf9431c236de4409d920',
    effective_at: '2026-01-01T09:50:05-03:00',
    municipality_code: '4314902',
    uf: 'RS',
    document_kind: 'nfse',
    items: [{
      number: 1,
      nbs: '115012000',
      cst: '200',
      tax_classification: '200043',
      tax_base: 200,
      quantity: 1,
      unit: 'UN',
    }],
  });

  assert.deepEqual(mapped, {
    id: '6194602ea71cbf9431c236de4409d920',
    versao: '0.0.1',
    dhFatoGerador: '2026-01-01T09:50:05-03:00',
    municipio: 4314902,
    uf: 'RS',
    tpDoc: 91,
    itens: [{
      numero: 1,
      nbs: '115012000',
      cst: '200',
      cClassTrib: '200043',
      baseCalculo: 200,
      quantidade: 1,
      unidade: 'UN',
    }],
  });
});

test('requires explicit nominal rates from 2027 and never invents them', () => {
  assert.throws(() => mapCanonicalRegular({
    operation_id: 'op-2027',
    effective_at: '2027-03-10T10:00:00-03:00',
    municipality_code: '4314902',
    uf: 'RS',
    document_kind: 'nfse',
    items: [{
      number: 1,
      nbs: '122011200',
      cst: '200',
      tax_classification: '200028',
      tax_base: 1200,
    }],
  }), BadRequestException);

  const mapped = mapCanonicalRegular({
    operation_id: 'op-2027',
    effective_at: '2027-03-10T10:00:00-03:00',
    municipality_code: '4314902',
    uf: 'RS',
    document_kind: 'nfse',
    items: [{
      number: 1,
      nbs: '122011200',
      cst: '200',
      tax_classification: '200028',
      tax_base: 1200,
      nominal_rates: { cbs: 8.8, ibs_state: 0.05, ibs_municipal: 0.05 },
    }],
  }) as any;

  assert.deepEqual(mapped.itens[0].aliquotasNominais, {
    cbs: 8.8,
    ibsEstadual: 0.05,
    ibsMunicipal: 0.05,
  });
});

test('forbids nominal rates before 2027 to match the pinned official engine', () => {
  assert.throws(() => mapCanonicalRegular({
    operation_id: 'op-2026',
    effective_at: '2026-12-31T10:00:00-03:00',
    municipality_code: '4314902',
    uf: 'RS',
    document_kind: 'nfse',
    items: [{
      number: 1,
      nbs: '115012000',
      cst: '200',
      tax_classification: '200043',
      tax_base: 200,
      nominal_rates: { cbs: 0.9, ibs_state: 0.05, ibs_municipal: 0.05 },
    }],
  }), BadRequestException);
});

test('maps canonical Simples NF-e to the official 0.0.6 golden contract without inventing fields', () => {
  const mapped = mapCanonicalSimples({
    operation_id: '507f1f77bcf86cd799439011',
    effective_date: '2027-03-15',
    document_kind: 'nfe',
    crt: '1',
    items: [{
      number: 1,
      activity_code: '01',
      tax_classification: '000001',
      tax_base: 950,
      selective_tax_amount: 50,
      ibs_effective_rate: 1.25,
      cbs_effective_rate: 2.75,
    }],
  });

  assert.deepEqual(mapped, {
    id: '507f1f77bcf86cd799439011',
    versao: '2.0.0',
    data: '2027-03-15',
    tpDoc: '55',
    CRT: '1',
    itens: [{
      numero: 1,
      cAtivSN: '01',
      cClassTrib: '000001',
      baseCalculo: '950.00',
      valorImpostoSeletivo: '50.00',
      pIBSSN: '1.25',
      pCBSSN: '2.75',
    }],
  });
});

test('maps canonical Simples NFC-e to tpDoc 65 and preserves optional regime/government facts', () => {
  const mapped = mapCanonicalSimples({
    operation_id: 'sale-nfce',
    effective_date: '2027-03-15',
    document_kind: 'nfce',
    crt: '3',
    ibs_cbs_regime_type: '2',
    government_entity_type: '2',
    items: [{
      number: 1,
      activity_code: '01',
      tax_classification: '000001',
      tax_base: 100,
      selective_tax_amount: 0,
    }],
  }) as any;

  assert.equal(mapped.tpDoc, '65');
  assert.equal(mapped.CRT, '3');
  assert.equal(mapped.tpRegimeIBSCBS, '2');
  assert.equal(mapped.tpEnteGov, '2');
  assert.equal(mapped.itens[0].baseCalculo, '100.00');
  assert.equal(mapped.itens[0].valorImpostoSeletivo, '0.00');
  assert.equal(mapped.itens[0].pIBSSN, undefined);
  assert.equal(mapped.itens[0].pCBSSN, undefined);
});


test('maps canonical Simples NFS-e to official tpDoc 91 using the pinned 0.0.6 golden activity', () => {
  const mapped = mapCanonicalSimples({
    operation_id: 'simples-nfse-91',
    effective_date: '2027-03-15',
    document_kind: 'nfse',
    crt: '1',
    items: [{
      number: 1,
      activity_code: '07',
      tax_classification: '000001',
      tax_base: 1000,
      selective_tax_amount: 0,
      ibs_effective_rate: 1.25,
      cbs_effective_rate: 2.75,
    }],
  }) as any;

  assert.equal(mapped.tpDoc, '91');
  assert.equal(mapped.CRT, '1');
  assert.deepEqual(mapped.itens[0], {
    numero: 1,
    cAtivSN: '07',
    cClassTrib: '000001',
    baseCalculo: '1000.00',
    valorImpostoSeletivo: '0.00',
    pIBSSN: '1.25',
    pCBSSN: '2.75',
  });
});


test('normalizes official Simples activity compatibility without inferring fiscal facts', () => {
  const result = normalizeCanonicalSimplesActivityCompatibility(
    'test',
    '07',
    { effective_date: '2027-03-15', document_kind: 'nfse', tax_classification: '000001' },
    {
      engine: {
        id: 'simples',
        upstreamRepository: 'https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional',
        upstreamCommit: 'c5b0f01c8351c3f0d0795cc617b29d233e9f98df',
        upstreamRelease: '0.0.6',
        license: 'MIT',
      },
      mode: 'shadow',
      checked_at: '2026-11-19T22:30:00-03:00',
      result: {
        codigo: '07',
        disponivel: true,
        admissivelNoDocumento: true,
        compativelComClassTrib: true,
        sujeitaFatorR: false,
        anexoSemFatorR: 'III',
        anexoComFatorR: null,
        tpDocsAdmissiveis: ['91'],
      },
    },
  );

  assert.equal(result.compatible, true);
  assert.equal(result.official.admissible_on_document, true);
  assert.equal(result.official.compatible_with_tax_classification, true);
  assert.equal(result.policy.rates_inferred, false);
  assert.equal(result.policy.calculation_executed, false);
  assert.equal(result.policy.financial_action_allowed, false);
  assert.equal(result.policy.issuance_binding_allowed, false);
});

test('official Simples activity compatibility fails closed on malformed upstream envelope', () => {
  assert.throws(
    () => normalizeCanonicalSimplesActivityCompatibility(
      'test',
      '07',
      { effective_date: '2027-03-15', document_kind: 'nfse', tax_classification: '000001' },
      {
        engine: {
          id: 'simples',
          upstreamRepository: 'repo',
          upstreamCommit: 'commit',
          upstreamRelease: '0.0.6',
          license: 'MIT',
        },
        mode: 'shadow',
        checked_at: '2026-11-19T22:30:00-03:00',
        result: { codigo: '07', disponivel: true },
      },
    ),
    BadGatewayException,
  );
});
