import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolveServiceProfile, ServiceProfileInput } from '../src/tax-engine/service-profile-rules';

type GoldenCase = {
  id: string;
  profile: 'business_consulting';
  input: Omit<ServiceProfileInput, 'profile'>;
  expected: {
    classification: Record<string, string>;
    municipal_tax: null | {
      iss_item: string;
      incidence_city_code: string;
      iss_taxation: string;
      iss_withholding?: string;
      iss_rate: number;
    };
    missing: string[];
  };
};

type Registry = { version: string; cases: GoldenCase[] };

const registry = JSON.parse(
  readFileSync(new URL('../tax-domains/golden-cases.json', import.meta.url), 'utf8'),
) as Registry;

test('golden-case registry is versioned and non-empty', () => {
  assert.match(registry.version, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(registry.cases.length >= 5);
  assert.equal(new Set(registry.cases.map((item) => item.id)).size, registry.cases.length);
});

for (const golden of registry.cases) {
  test(`fiscal golden case: ${golden.id}`, () => {
    const actual = resolveServiceProfile({ profile: golden.profile, ...golden.input });

    assert.deepEqual(actual.classification, golden.expected.classification);
    assert.deepEqual([...actual.missing].sort(), [...golden.expected.missing].sort());

    if (golden.expected.municipal_tax === null) {
      assert.equal(actual.municipal_tax, undefined);
      return;
    }

    assert.ok(actual.municipal_tax);
    assert.deepEqual(
      {
        iss_item: actual.municipal_tax.iss_item,
        incidence_city_code: actual.municipal_tax.incidence_city_code,
        iss_taxation: actual.municipal_tax.iss_taxation,
        ...(actual.municipal_tax.iss_withholding
          ? { iss_withholding: actual.municipal_tax.iss_withholding }
          : {}),
        iss_rate: actual.municipal_tax.iss_rate,
      },
      golden.expected.municipal_tax,
    );
  });
}
