import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveServiceProfile } from '../src/tax-engine/service-profile-rules';

test('business consulting profile resolves vetted national fields and Mogi ISS 17.01 at 4 percent', () => {
  const result = resolveServiceProfile({
    profile: 'business_consulting',
    issuerCityCode: '3530607',
    destinationCityCode: '3550308',
    issWithholding: '1',
  });

  assert.deepEqual(result.classification, {
    national_service_code: '170101',
    cIndOp: '100301',
    cst: '000',
    cClassTrib: '000001',
    tax_treatment: 'standard',
  });
  assert.equal(result.municipal_tax?.iss_item, '17.01');
  assert.equal(result.municipal_tax?.incidence_city_code, '3530607');
  assert.equal(result.municipal_tax?.iss_taxation, '1');
  assert.equal(result.municipal_tax?.iss_withholding, '1');
  assert.equal(result.municipal_tax?.iss_rate, 4);
  assert.deepEqual(result.missing, []);
  assert.ok(result.sources.some((source) => source.dataset === 'mogi-iss-service-rate'));
});

test('business consulting profile refuses to infer ISS withholding', () => {
  const result = resolveServiceProfile({
    profile: 'business_consulting',
    issuerCityCode: '3530607',
    destinationCityCode: '3550308',
  });

  assert.ok(result.missing.includes('iss_withholding'));
  assert.equal(result.municipal_tax?.iss_withholding, undefined);
});

test('business consulting profile requires destination municipality for its destination-sensitive RTC context', () => {
  const result = resolveServiceProfile({
    profile: 'business_consulting',
    issuerCityCode: '3530607',
    issWithholding: '1',
  });

  assert.ok(result.missing.includes('destination_city_code'));
});

test('business consulting profile does not invent municipal ISS outside a vetted municipality', () => {
  const result = resolveServiceProfile({
    profile: 'business_consulting',
    issuerCityCode: '3550308',
    destinationCityCode: '3304557',
    issWithholding: '1',
  });

  assert.equal(result.municipal_tax, undefined);
  assert.ok(result.missing.includes('municipal_iss_rule'));
});
