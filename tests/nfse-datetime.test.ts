import assert from 'node:assert/strict';
import test from 'node:test';
import { formatNfseDateTimeUtc } from '../src/xml-engine/nfse-datetime';

test('formats NFS-e datetime without milliseconds or Z', () => {
  assert.equal(formatNfseDateTimeUtc('2026-08-08T23:54:48.321Z'), '2026-08-08T23:54:48+00:00');
});
test('normalizes offset-aware instant to valid +00:00 representation', () => {
  assert.equal(formatNfseDateTimeUtc('2026-08-08T20:54:48-03:00'), '2026-08-08T23:54:48+00:00');
});
