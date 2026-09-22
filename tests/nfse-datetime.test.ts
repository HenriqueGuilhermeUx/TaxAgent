import assert from 'node:assert/strict';
import test from 'node:test';
import { formatNfseDateTimeUtc } from '../src/xml-engine/nfse-datetime';

test('formats UTC instant as Brazil civil time with -03:00 offset', () => {
  assert.equal(formatNfseDateTimeUtc('2026-08-08T23:54:48.321Z'), '2026-08-08T20:54:48-03:00');
});
test('preserves the instant while normalizing offset-aware input to Brazil offset', () => {
  assert.equal(formatNfseDateTimeUtc('2026-08-08T20:54:48-03:00'), '2026-08-08T20:54:48-03:00');
});
