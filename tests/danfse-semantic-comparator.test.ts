import assert from 'node:assert/strict';
import test from 'node:test';
import { assessDanfseSemanticFields } from '../src/danfse/danfse-semantic-comparator';
import { DanfseModel } from '../src/danfse/danfse.types';

function model(): DanfseModel {
  return {
    specVersion: 'NT008-1.02',
    environment: 'test',
    accessKey: '00012345678901234567890123456789012345678901234567',
    number: '000000123',
    competence: '2026-11-19',
    issuedAt: '2026-11-19T10:00:00-03:00',
    provider: { taxId: '12.345.678/0001-90', name: 'Prestador Exemplo Ltda' },
    customer: { taxId: '98.765.432/0001-10', name: 'Cliente Exemplo S.A.' },
    recipient: {},
    intermediary: {},
    service: {
      nationalCode: '010101',
      municipalCode: '0007',
      nbs: '114011900',
      description: 'Consultoria empresarial especializada',
    },
    iss: { base: '1000.00', rate: '5.0000', amount: '50.00', retained: '0.00' },
    federal: {},
    ibsCbs: {
      cstClass: '000 / 000001',
      base: '1000.00',
      rates: '0.1000 / 0.0000 / 0.9000',
      stateAmount: '1.00',
      municipalAmount: '0.00',
      ibsTotal: '1.00',
      cbsTotal: '9.00',
    },
    totals: { service: '1000.00', retentions: '0.00', net: '950.00', netPlusIbsCbs: '1010.00' },
  };
}

function extracted(overrides: Record<string, string | undefined> = {}, ambiguousFields?: string[]) {
  return {
    extractionVersion: 'fixture-v1',
    ambiguousFields,
    fields: {
      'document.access_key': '00012345678901234567890123456789012345678901234567',
      'document.number': '000000123',
      'document.environment': 'test',
      'document.competence': '2026-11-19',
      'document.issued_at': '2026-11-19T10:00:00-03:00',
      'provider.tax_id': '12345678000190',
      'provider.name': 'Prestador Exemplo Ltda',
      'customer.tax_id': '98765432000110',
      'customer.name': 'Cliente Exemplo S.A.',
      'service.national_code': '010101',
      'service.municipal_code': '0007',
      'service.nbs': '114011900',
      'service.description': 'Consultoria empresarial especializada',
      'iss.base': '1000',
      'iss.rate': '5',
      'iss.amount': '50.0',
      'iss.retained': '0',
      'ibs_cbs.cst_class': '000 / 000001',
      'ibs_cbs.base': '1000.000',
      'ibs_cbs.rates': '0.1000 / 0.0000 / 0.9000',
      'ibs_cbs.state_amount': '1',
      'ibs_cbs.municipal_amount': '0',
      'ibs_cbs.ibs_total': '1.00',
      'ibs_cbs.cbs_total': '9',
      'totals.service': '1000.0000',
      'totals.retentions': '0',
      'totals.net': '950',
      'totals.net_plus_ibs_cbs': '1010',
      ...overrides,
    },
  };
}

test('semantic comparator reaches matched_fields only for independently matching canonical fields', () => {
  const assessment = assessDanfseSemanticFields(model(), extracted());
  assert.equal(assessment.state, 'matched_fields');
  assert.equal(assessment.authoritative, false);
  assert.equal(assessment.visual_conformance, 'not_assessed');
  assert.deepEqual(assessment.findings, []);
});

test('semantic comparator detects conflicting provider CNPJ without persisting values', () => {
  const assessment = assessDanfseSemanticFields(model(), extracted({ 'provider.tax_id': '11111111000111' }));
  assert.equal(assessment.state, 'different');
  assert.deepEqual(assessment.findings, [{ field: 'provider.tax_id', code: 'different' }]);
  assert.equal(JSON.stringify(assessment).includes('11111111000111'), false);
  assert.equal(JSON.stringify(assessment).includes('12345678000190'), false);
});

test('format-only tax-id changes and decimal scale changes compare equal', () => {
  const assessment = assessDanfseSemanticFields(model(), extracted({
    'provider.tax_id': '12.345.678/0001-90',
    'iss.base': '01000.000000',
    'totals.service': '1000.0',
  }));
  assert.equal(assessment.state, 'matched_fields');
});

test('leading zero codes remain significant', () => {
  const assessment = assessDanfseSemanticFields(model(), extracted({ 'service.municipal_code': '7' }));
  assert.equal(assessment.state, 'different');
  assert.deepEqual(assessment.findings, [{ field: 'service.municipal_code', code: 'different' }]);
});

test('missing extracted required field is inconclusive, never a match', () => {
  const assessment = assessDanfseSemanticFields(model(), extracted({ 'document.access_key': undefined }));
  assert.equal(assessment.state, 'inconclusive');
  assert.deepEqual(assessment.findings, [{ field: 'document.access_key', code: 'missing_extracted' }]);
});

test('ambiguous extraction is inconclusive even when a candidate value is present', () => {
  const assessment = assessDanfseSemanticFields(model(), extracted({}, ['provider.tax_id']));
  assert.equal(assessment.state, 'inconclusive');
  assert.deepEqual(assessment.findings, [{ field: 'provider.tax_id', code: 'ambiguous_extracted' }]);
});

test('missing canonical core identity remains inconclusive', () => {
  const m = model();
  delete m.accessKey;
  const assessment = assessDanfseSemanticFields(m, extracted());
  assert.equal(assessment.state, 'inconclusive');
  assert.deepEqual(assessment.findings, [{ field: 'document.access_key', code: 'missing_canonical' }]);
});

test('unexpected extracted fields do not affect the bounded allowlist', () => {
  const e = extracted({ 'secret.raw_text': 'PII that must not be propagated' });
  const assessment = assessDanfseSemanticFields(model(), e);
  assert.equal(assessment.state, 'matched_fields');
  assert.equal(JSON.stringify(assessment).includes('secret.raw_text'), false);
  assert.equal(JSON.stringify(assessment).includes('PII'), false);
});
