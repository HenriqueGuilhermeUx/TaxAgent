import assert from 'node:assert/strict';
import test from 'node:test';
import { officialRtcMode, resolveOfficialRtcBaseUrl } from '../src/official-rtc/official-rtc.client';
import { OFFICIAL_RTC_MANIFEST } from '../src/official-rtc/official-rtc.manifest';
import { officialRtcInputSha256 } from '../src/official-rtc/official-rtc.service';

test('pins the three Receita Federal MIT engines to explicit upstream releases and commits', () => {
  assert.equal(OFFICIAL_RTC_MANIFEST.regular.upstreamRelease, '1.6.1');
  assert.equal(OFFICIAL_RTC_MANIFEST.simples.upstreamRelease, '0.0.6');
  assert.equal(OFFICIAL_RTC_MANIFEST.danfse.upstreamRelease, '1.0.0');
  for (const engine of Object.values(OFFICIAL_RTC_MANIFEST)) {
    assert.equal(engine.license, 'MIT');
    assert.match(engine.upstreamCommit, /^[0-9a-f]{40}$/);
    assert.match(engine.upstreamRepository, /^ReceitaFederal\//);
  }
});

test('official RTC URLs fail closed for insecure remote http and embedded credentials', () => {
  assert.throws(() => resolveOfficialRtcBaseUrl('http://example.com'), /https/);
  assert.throws(() => resolveOfficialRtcBaseUrl('https://user:pass@example.com'), /credentials/);
  assert.equal(resolveOfficialRtcBaseUrl('http://127.0.0.1:8080')?.toString(), 'http://127.0.0.1:8080/');
  assert.equal(resolveOfficialRtcBaseUrl('https://rtc.internal.example')?.toString(), 'https://rtc.internal.example/');
});

test('official RTC mode defaults to off and only recognizes explicit safe modes', () => {
  const before = process.env.TAXAGENT_RTC_ENGINE_MODE;
  delete process.env.TAXAGENT_RTC_ENGINE_MODE;
  assert.equal(officialRtcMode(), 'off');
  process.env.TAXAGENT_RTC_ENGINE_MODE = 'shadow';
  assert.equal(officialRtcMode(), 'shadow');
  process.env.TAXAGENT_RTC_ENGINE_MODE = 'official';
  assert.equal(officialRtcMode(), 'official');
  process.env.TAXAGENT_RTC_ENGINE_MODE = 'anything-else';
  assert.equal(officialRtcMode(), 'off');
  if (before === undefined) delete process.env.TAXAGENT_RTC_ENGINE_MODE; else process.env.TAXAGENT_RTC_ENGINE_MODE = before;
});

test('official RTC input hash is deterministic across JSON key order', () => {
  assert.equal(
    officialRtcInputSha256({ amount: 100, item: { cst: '000', nbs: '1.01' } }),
    officialRtcInputSha256({ item: { nbs: '1.01', cst: '000' }, amount: 100 }),
  );
  assert.notEqual(officialRtcInputSha256({ amount: 100 }), officialRtcInputSha256({ amount: 101 }));
});
