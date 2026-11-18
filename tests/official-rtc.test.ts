import assert from 'node:assert/strict';
import test from 'node:test';
import { officialRtcMode, resolveOfficialRtcBaseUrl } from '../src/official-rtc/official-rtc.client';
import { OFFICIAL_RTC_MANIFEST } from '../src/official-rtc/official-rtc.manifest';
import { officialRtcInputSha256 } from '../src/official-rtc/official-rtc.service';
import { assessOfficialRtcObservability } from '../src/official-rtc/official-rtc-observability';

test('pins the three Receita Federal MIT engines to exact release tag commits', () => {
  assert.deepEqual(
    {
      release: OFFICIAL_RTC_MANIFEST.regular.upstreamRelease,
      commit: OFFICIAL_RTC_MANIFEST.regular.upstreamCommit,
    },
    { release: '1.6.1', commit: '150cccbe414d4a5edea703e4f7a424af5aa222c7' },
  );
  assert.deepEqual(
    {
      release: OFFICIAL_RTC_MANIFEST.simples.upstreamRelease,
      commit: OFFICIAL_RTC_MANIFEST.simples.upstreamCommit,
    },
    { release: '0.0.6', commit: 'c5b0f01c8351c3f0d0795cc617b29d233e9f98df' },
  );
  assert.deepEqual(
    {
      release: OFFICIAL_RTC_MANIFEST.danfse.upstreamRelease,
      commit: OFFICIAL_RTC_MANIFEST.danfse.upstreamCommit,
    },
    { release: '1.0.0', commit: '8d79e6b2f7fad6375340afcb51c85ed370c64a14' },
  );
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


test('official observability assessment accepts only calculated/simulated items as usable', () => {
  const assessment = assessOfficialRtcObservability({
    objetos: [
      { nObj: 1, estadoItem: 'CALCULADO', tribCalc: { value: 1 } },
      { nObj: 2, estadoItem: 'CALCULO_SIMULADO', tribCalc: { value: 2 } },
    ],
  });
  assert.equal(assessment.response_valid, true);
  assert.equal(assessment.all_items_usable, true);
  assert.equal(assessment.authoritative_eligible, false);
  assert.equal(assessment.simulation_only, true);
  assert.equal(assessment.counts.calculated, 1);
  assert.equal(assessment.counts.simulated, 1);
});

test('official observability assessment fails closed on fiscal item errors even under HTTP 200', () => {
  const assessment = assessOfficialRtcObservability({
    objetos: [
      { nObj: 1, estadoItem: 'CALCULADO', tribCalc: { value: 1 } },
      { nObj: 2, estadoItem: 'INCONSISTENCIA_ENTRADA', erros: [{ code: 'REG-011' }] },
      { nObj: 3, estadoItem: 'NAO_IMPLEMENTADO', erros: [{ code: 'CAL-007' }] },
      { nObj: 4, estadoItem: 'NAO_CALCULADO' },
      { nObj: 5, estadoItem: 'FALHA_TECNICA' },
    ],
  });
  assert.equal(assessment.all_items_usable, false);
  assert.equal(assessment.authoritative_eligible, false);
  assert.equal(assessment.counts.input_error, 1);
  assert.equal(assessment.counts.unsupported, 1);
  assert.equal(assessment.counts.not_calculated, 1);
  assert.equal(assessment.counts.technical_failure, 1);
  assert.deepEqual(assessment.items[1].errors, [{ code: 'REG-011' }]);
});

test('official observability assessment treats unknown/malformed states as unusable', () => {
  const unknown = assessOfficialRtcObservability({ objetos: [{ nObj: 1, estadoItem: 'NEW_STATE_FROM_UPSTREAM' }] });
  assert.equal(unknown.response_valid, true);
  assert.equal(unknown.all_items_usable, false);
  assert.equal(unknown.counts.unknown, 1);
  assert.equal(unknown.items[0].state, 'UNKNOWN');

  const malformed = assessOfficialRtcObservability({ total: {} });
  assert.equal(malformed.response_valid, false);
  assert.equal(malformed.all_items_usable, false);
  assert.equal(malformed.authoritative_eligible, false);
});
