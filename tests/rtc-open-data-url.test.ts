import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_RTC_OPEN_DATA_BASE_URL, resolveRtcOpenDataUrl } from '../src/tax-engine/rtc-open-data.client';

test('RTC open-data URL preserves the official API prefix', () => {
  const url = resolveRtcOpenDataUrl('/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/NFSE/000001');
  assert.equal(
    url.toString(),
    'https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/NFSE/000001',
  );
});

test('RTC NFS-e classification URL carries the effective-date query required by the official API', () => {
  const url = resolveRtcOpenDataUrl(
    '/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/NFSE/000001',
    DEFAULT_RTC_OPEN_DATA_BASE_URL,
    { data: '2026-08-15' },
  );
  assert.equal(
    url.toString(),
    'https://piloto-cbs.tributos.gov.br/servico/calculadora-consumo/api/calculadora/dados-abertos/classificacoes-tributarias/cbs-ibs/NFSE/000001?data=2026-08-15',
  );
});

test('RTC open-data URL supports bases with or without trailing slash', () => {
  const path = '/calculadora/dados-abertos/versao';
  assert.equal(
    resolveRtcOpenDataUrl(path, DEFAULT_RTC_OPEN_DATA_BASE_URL).toString(),
    resolveRtcOpenDataUrl(path, `${DEFAULT_RTC_OPEN_DATA_BASE_URL}/`).toString(),
  );
});

test('RTC open-data URL preserves configured query strings while adding runtime query parameters', () => {
  const url = resolveRtcOpenDataUrl(
    '/calculadora/dados-abertos/classificacoes-tributarias/nbs?nbs=1.0101.10.00',
    DEFAULT_RTC_OPEN_DATA_BASE_URL,
    { data: '2026-08-15' },
  );
  assert.equal(url.pathname, '/servico/calculadora-consumo/api/calculadora/dados-abertos/classificacoes-tributarias/nbs');
  assert.equal(url.searchParams.get('nbs'), '1.0101.10.00');
  assert.equal(url.searchParams.get('data'), '2026-08-15');
});
