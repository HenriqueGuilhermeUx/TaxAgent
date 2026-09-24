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

const accessKey = '35000000000000000000000000000000000000000000000001';

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
  assert.match(built.xml, /<infPedReg[^>]*Id="PRE\d{56}"/);
  assert.match(built.xml, /<dhEvento>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00<\/dhEvento>/);
  assert.doesNotMatch(built.xml, /<nPedRegEvento>/);
  assert.match(built.xml, /<e101101>/);
  assert.match(built.xml, /<CNPJAutor>00000000000000<\/CNPJAutor>/);
  assert.equal(built.verifiedLayout, false);
});

test('national cancellation builder fails closed for a malformed access key before XML generation', () => {
  assert.throws(
    () => new EventBuilderService().buildCancellation({
      companyId: company.id,
      environment: 'test',
      accessKey: '123',
      reasonCode: '1',
      reason: 'Cancelamento sintetico para teste',
    }, company as any),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_NFSE_ACCESS_KEY_INVALID',
  );
});
