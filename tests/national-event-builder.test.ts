import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { EventBuilderService } from '../src/xml-engine/event-builder.service';

const company = {
  id: 'comp_test',
  tax_id: '00000000000000',
  municipal_registration: null,
  city_code: '3530607',
  tax_regime: 'regular',
};

const accessKey = '35306072200000000000000000000000000126090000000000';

test('national cancellation builder matches active PEDREGEVT identity and shape', () => {
  const built = new EventBuilderService().buildCancellation({
    companyId: company.id,
    environment: 'test',
    accessKey,
    reasonCode: '1',
    reason: 'Cancelamento sintetico para teste de conformidade',
  }, company as any);

  assert.equal(built.id, `PRE${accessKey}101101`);
  assert.equal(built.id.length, 59);
  assert.match(built.xml, /<pedRegEvento[^>]*versao="1\.01"/);
  assert.match(built.xml, /<infPedReg[^>]*Id="PRE[0-9]{56}"/);
  assert.match(built.xml, /<dhEvento>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00<\/dhEvento>/);
  assert.doesNotMatch(built.xml, /<nPedRegEvento>/);
  assert.match(built.xml, /<e101101>/);
  assert.match(built.xml, /<CNPJAutor>00000000000000<\/CNPJAutor>/);
  assert.equal(built.verifiedLayout, false);
});

test('national cancellation builder fails closed for malformed national key structure', () => {
  for (const malformed of [
    '123',
    '35000000000000000000000000000000000000000000000001',
  ]) {
    assert.throws(
      () => new EventBuilderService().buildCancellation({
        companyId: company.id,
        environment: 'test',
        accessKey: malformed,
        reasonCode: '1',
        reason: 'Cancelamento sintetico para teste',
      }, company as any),
      (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_NFSE_ACCESS_KEY_INVALID',
    );
  }
});

test('national cancellation blocks a structurally valid key that belongs to another Company', () => {
  const anotherCompanyKey = '35306072299999999000151000000000000126090000000000';
  assert.throws(
    () => new EventBuilderService().buildCancellation({
      companyId: company.id,
      environment: 'test',
      accessKey: anotherCompanyKey,
      reasonCode: '1',
      reason: 'Cancelamento sintetico para teste',
    }, company as any),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_NFSE_ACCESS_KEY_COMPANY_MISMATCH',
  );
});

test('national cancellation accepts the alphanumeric-CNPJ segment allowed by the active key layout', () => {
  const alphaCompany = { ...company, tax_id: '12ABC34501DE35' };
  const alphaKey = '35306072212ABC34501DE35000000000000126090000000000';
  const built = new EventBuilderService().buildCancellation({
    companyId: alphaCompany.id,
    environment: 'test',
    accessKey: alphaKey,
    reasonCode: '1',
    reason: 'Cancelamento sintetico para teste',
  }, alphaCompany as any);
  assert.match(built.xml, /<CNPJAutor>12ABC34501DE35<\/CNPJAutor>/);
});
