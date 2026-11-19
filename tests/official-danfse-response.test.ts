import assert from 'node:assert/strict';
import test from 'node:test';
import { OfficialRtcClient } from '../src/official-rtc/official-rtc.client';

test('official DANFSe rejects HTTP 200 with HTML instead of PDF', async () => {
  const previousUrl = process.env.TAXAGENT_RTC_DANFSE_URL;
  const previousFetch = globalThis.fetch;
  process.env.TAXAGENT_RTC_DANFSE_URL = 'https://rtc.example.test';
  globalThis.fetch = async () => new Response('<html>upstream error</html>', { status: 200, headers: { 'content-type': 'text/html' } });
  try {
    await assert.rejects(new OfficialRtcClient().renderDanfse('<NFSe/>'), /valid PDF header/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.TAXAGENT_RTC_DANFSE_URL;
    else process.env.TAXAGENT_RTC_DANFSE_URL = previousUrl;
  }
});

test('official DANFSe accepts a bounded PDF signature response', async () => {
  const previousUrl = process.env.TAXAGENT_RTC_DANFSE_URL;
  const previousFetch = globalThis.fetch;
  process.env.TAXAGENT_RTC_DANFSE_URL = 'https://rtc.example.test';
  const bytes = Buffer.from('%PDF-1.7\\nmock-pdf');
  globalThis.fetch = async () => new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } });
  try {
    assert.deepEqual(await new OfficialRtcClient().renderDanfse('<NFSe/>'), bytes);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.TAXAGENT_RTC_DANFSE_URL;
    else process.env.TAXAGENT_RTC_DANFSE_URL = previousUrl;
  }
});
