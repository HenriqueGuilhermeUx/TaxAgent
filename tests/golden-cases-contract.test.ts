import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type GoldenCase = {
  id: string;
  profile: string;
  input: {
    issuerCityCode: string;
    destinationCityCode?: string;
    issWithholding?: string;
  };
  expected: {
    classification: Record<string, unknown>;
    municipal_tax: null | Record<string, unknown>;
    missing: string[];
  };
};

type Registry = {
  version: string;
  description: string;
  cases: GoldenCase[];
};

const registry = JSON.parse(
  readFileSync(new URL('../tax-domains/golden-cases.json', import.meta.url), 'utf8'),
) as Registry;

const cityCode = /^\d{7}$/;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedWithholding = new Set(['1', '2', '3']);

function assertGoldenCaseContract(item: GoldenCase): void {
  assert.match(item.id, idPattern, `${item.id}: id must be stable kebab-case`);
  assert.equal(item.profile, 'business_consulting', `${item.id}: unsupported profile in registry`);
  assert.match(item.input.issuerCityCode, cityCode, `${item.id}: issuerCityCode must be a 7-digit IBGE code`);

  if (item.input.destinationCityCode !== undefined) {
    assert.match(item.input.destinationCityCode, cityCode, `${item.id}: destinationCityCode must be a 7-digit IBGE code`);
  }
  if (item.input.issWithholding !== undefined) {
    assert.ok(allowedWithholding.has(item.input.issWithholding), `${item.id}: invalid issWithholding`);
  }

  assert.deepEqual(
    Object.keys(item.expected.classification).sort(),
    ['cClassTrib', 'cIndOp', 'cst', 'national_service_code', 'tax_treatment'].sort(),
    `${item.id}: classification contract changed`,
  );
  assert.equal(new Set(item.expected.missing).size, item.expected.missing.length, `${item.id}: duplicate missing gates`);

  if (item.expected.municipal_tax) {
    assert.match(
      String(item.expected.municipal_tax.incidence_city_code),
      cityCode,
      `${item.id}: incidence_city_code must be a 7-digit IBGE code`,
    );
    assert.equal(typeof item.expected.municipal_tax.iss_rate, 'number', `${item.id}: iss_rate must be numeric`);
  }
}

test('golden-case registry has a stable machine-readable contract', () => {
  assert.match(registry.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(registry.description.length > 0);
  assert.ok(registry.cases.length >= 5);
  assert.equal(new Set(registry.cases.map((item) => item.id)).size, registry.cases.length);

  for (const item of registry.cases) assertGoldenCaseContract(item);
});
