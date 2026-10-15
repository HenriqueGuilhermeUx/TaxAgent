import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { PlugNotasClient } from '../src/providers/plugnotas/plugnotas.client';

const originalFetch = globalThis.fetch;
const originalSandboxKey = process.env.PLUGNOTAS_SANDBOX_API_KEY;
const originalSandboxTransmission = process.env.PLUGNOTAS_SANDBOX_TRANSMISSION_ENABLED;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalSandboxKey === undefined) delete process.env.PLUGNOTAS_SANDBOX_API_KEY;
  else process.env.PLUGNOTAS_SANDBOX_API_KEY = originalSandboxKey;
  if (originalSandboxTransmission === undefined) delete process.env.PLUGNOTAS_SANDBOX_TRANSMISSION_ENABLED;
  else process.env.PLUGNOTAS_SANDBOX_TRANSMISSION_ENABLED = originalSandboxTransmission;
});

test('PlugNotas sandbox municipality capability uses documented city endpoint and X-API-KEY', async () => {
  process.env.PLUGNOTAS_SANDBOX_API_KEY = 'sandbox-test-key';
  let observedUrl = '';
  let observedKey = '';
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    observedUrl = String(input);
    observedKey = String((init?.headers as Record<string, string>)?.['X-API-KEY'] ?? '');
    return new Response(JSON.stringify({ id: 3548500, nome: 'Santos', uf: 'SP', padrao: 'GISS', certificado: true }), { status: 200 });
  }) as typeof fetch;

  const result = await new PlugNotasClient().getMunicipality('test', '3548500');
  assert.equal(observedUrl, 'https://api.sandbox.plugnotas.com.br/nfse/cidades/3548500');
  assert.equal(observedKey, 'sandbox-test-key');
  assert.equal(result?.nome, 'Santos');
  assert.equal(result?.certificado, true);
});

test('PlugNotas municipality 404 is treated as no gateway coverage', async () => {
  process.env.PLUGNOTAS_SANDBOX_API_KEY = 'sandbox-test-key';
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: 'not found' }), { status: 404 })) as typeof fetch;
  const result = await new PlugNotasClient().getMunicipality('test', '3550308');
  assert.equal(result, null);
});

test('PlugNotas sandbox POST remains locked by default', async () => {
  process.env.PLUGNOTAS_SANDBOX_API_KEY = 'sandbox-test-key';
  delete process.env.PLUGNOTAS_SANDBOX_TRANSMISSION_ENABLED;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  await assert.rejects(
    () => new PlugNotasClient().issueNfse('test', [{ idIntegracao: 'safe-test' }]),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_PLUGNOTAS_SANDBOX_TRANSMISSION_LOCKED',
  );
  assert.equal(called, false);
});
