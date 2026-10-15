import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { NfseNationalProvider } from '../src/providers/nfse-national/nfse-national.provider';

const input = {
  companyId: 'comp_test',
  environment: 'test' as const,
  accessKey: '35306072200000000000000000000000000126090000000000',
  reasonCode: '1',
  reason: 'Cancelamento de teste com reconciliação',
};

interface FixtureOptions {
  reconciled?: any;
  queryError?: Error;
  existingRequest?: any;
  rejectionEvidence?: any;
  registerResponse?: any;
}

function fixture(options: FixtureOptions = {}) {
  let queryCalls = 0;
  let postCalls = 0;
  let signatureCalls = 0;
  const saved: Array<{ kind: string; content: any; metadata: any; id: string; sha256: string }> = [];
  const eventId = `PRE${input.accessKey}101101`;

  const documents = {
    async latestContent(_invoiceId: string, kind: string) {
      if (kind === 'cancellation-request-xml') return options.existingRequest ?? null;
      if (kind === 'cancellation-rejection-json') return options.rejectionEvidence ?? null;
      return null;
    },
    async save(value: any) {
      const id = `doc_${saved.length + 1}`;
      const record = { ...value, id, sha256: `sha_${saved.length + 1}` };
      saved.push(record);
      return { id, kind: value.kind, sha256: record.sha256, bytes: String(value.content).length, content_type: value.contentType };
    },
  };

  const client = {
    async findEventByTypeAndSequence(environment: string, accessKey: string, eventType: string, sequence: number) {
      queryCalls += 1;
      assert.equal(environment, 'test');
      assert.equal(accessKey, input.accessKey);
      assert.equal(eventType, '101101');
      assert.equal(sequence, 1);
      if (options.queryError) throw options.queryError;
      return options.reconciled ?? null;
    },
    async registerEvent(environment: string, accessKey: string, signedXml: string) {
      postCalls += 1;
      assert.equal(environment, 'test');
      assert.equal(accessKey, input.accessKey);
      assert.equal(signedXml, '<SIGNED-EVENT/>');
      return options.registerResponse ?? { __eventXml: '<REGISTERED-EVENT/>' };
    },
    decodeEventXml(response: any) { return response.__eventXml; },
    sanitize(response: any) { return { ...response, __eventXml: response.__eventXml ? '[stored-as-fiscal-document]' : undefined }; },
  };

  const provider = new NfseNationalProvider(
    { async getCompany() { return { id: 'comp_test', tax_id: '00000000000000', city_code: '3530607', tax_regime: 'regular' }; } } as any,
    { async getActiveMaterial() { return { fingerprint: 'fp_test' }; } } as any,
    {
      active() { return { id: 'nfse-prodrest-v1.01-20260727' }; },
      eventConformance() { return { verified: true, reason: 'test fixture' }; },
      dpsConformance() { return { verified: true, reason: 'test fixture' }; },
    } as any,
    {} as any,
    {} as any,
    { buildCancellation() { return { xml: '<EVENT/>', id: eventId, verifiedLayout: true }; } } as any,
    { async validateWellFormed() {}, async validateEventStrict() {}, async validateStrict() {} } as any,
    { sign() { signatureCalls += 1; return '<SIGNED-EVENT/>'; } } as any,
    client as any,
    documents as any,
    {} as any,
  );

  return {
    provider,
    saved,
    queryCalls: () => queryCalls,
    postCalls: () => postCalls,
    signatureCalls: () => signatureCalls,
    eventId,
  };
}

async function withLive<T>(fn: () => Promise<T>): Promise<T> {
  const priorMode = process.env.TAXAGENT_NFSE_MODE;
  const priorLive = process.env.TAXAGENT_LIVE_ENABLED;
  process.env.TAXAGENT_NFSE_MODE = 'live';
  process.env.TAXAGENT_LIVE_ENABLED = 'true';
  try { return await fn(); }
  finally {
    if (priorMode === undefined) delete process.env.TAXAGENT_NFSE_MODE; else process.env.TAXAGENT_NFSE_MODE = priorMode;
    if (priorLive === undefined) delete process.env.TAXAGENT_LIVE_ENABLED; else process.env.TAXAGENT_LIVE_ENABLED = priorLive;
  }
}

test('national cancellation reconciliation returns an already registered 101101 event with zero POST', async () => {
  const f = fixture({ reconciled: { __eventXml: '<EXISTING-EVENT/>' } });
  const result = await withLive(() => f.provider.cancel(input, { invoiceId: 'inv_test' }));

  assert.equal(result.status, 'registered');
  assert.equal(result.providerReference, f.eventId);
  assert.equal(f.queryCalls(), 1);
  assert.equal(f.postCalls(), 0);
  assert.equal(f.signatureCalls(), 0);
  assert.equal(f.saved.filter((item) => item.kind === 'cancellation-event-xml').length, 1);
});

test('first national cancellation POSTs once only after reconciliation proves event absence', async () => {
  const f = fixture();
  const result = await withLive(() => f.provider.cancel(input, { invoiceId: 'inv_test' }));

  assert.equal(result.status, 'registered');
  assert.equal(f.queryCalls(), 1);
  assert.equal(f.postCalls(), 1);
  assert.equal(f.signatureCalls(), 1);
  assert.equal(f.saved.filter((item) => item.kind === 'cancellation-request-xml').length, 1);
  assert.equal(f.saved.filter((item) => item.kind === 'cancellation-event-xml').length, 1);
});

test('persisted uncertain cancellation request never triggers a blind second POST when event is still absent', async () => {
  const f = fixture({ existingRequest: { id: 'doc_request_1', sha256: 'request_sha', metadata: {}, content: Buffer.from('<SIGNED/>') } });

  await assert.rejects(
    () => withLive(() => f.provider.cancel(input, { invoiceId: 'inv_test' })),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_NFSE_EVENT_RECONCILIATION_PENDING' && error.retryable,
  );
  assert.equal(f.queryCalls(), 1);
  assert.equal(f.postCalls(), 0);
  assert.equal(f.signatureCalls(), 0);
});

test('transient reconciliation failure after a persisted request remains pending and never POSTs', async () => {
  const f = fixture({
    existingRequest: { id: 'doc_request_1', sha256: 'request_sha', metadata: {}, content: Buffer.from('<SIGNED/>') },
    queryError: new FiscalEngineError('NFSE_TRANSIENT_HTTP', 'temporary provider failure', true),
  });

  await assert.rejects(
    () => withLive(() => f.provider.cancel(input, { invoiceId: 'inv_test' })),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'TA_NFSE_EVENT_RECONCILIATION_PENDING' && error.retryable,
  );
  assert.equal(f.queryCalls(), 1);
  assert.equal(f.postCalls(), 0);
  assert.equal(f.signatureCalls(), 0);
});

test('a definitively rejected prior request can be replaced after a fresh 404 reconciliation', async () => {
  const f = fixture({
    existingRequest: { id: 'doc_request_1', sha256: 'request_sha', metadata: {}, content: Buffer.from('<SIGNED/>') },
    rejectionEvidence: { id: 'doc_rejection_1', sha256: 'reject_sha', metadata: { requestDocumentId: 'doc_request_1' }, content: Buffer.from('{}') },
  });
  const result = await withLive(() => f.provider.cancel(input, { invoiceId: 'inv_test' }));

  assert.equal(result.status, 'registered');
  assert.equal(f.queryCalls(), 1);
  assert.equal(f.postCalls(), 1);
  assert.equal(f.signatureCalls(), 1);
});

test('structured SEFIN event rejection is persisted as conclusive evidence for that exact request', async () => {
  const f = fixture({ registerResponse: { erro: { codigo: 'E999', descricao: 'Regra de negócio de teste' } } });
  const result = await withLive(() => f.provider.cancel(input, { invoiceId: 'inv_test' }));

  assert.equal(result.status, 'rejected');
  assert.equal(result.rejection?.code, 'E999');
  assert.equal(f.postCalls(), 1);
  const request = f.saved.find((item) => item.kind === 'cancellation-request-xml')!;
  const rejection = f.saved.find((item) => item.kind === 'cancellation-rejection-json')!;
  assert.equal(rejection.metadata.requestDocumentId, request.id);
});

test('HTTP success without event XML stays uncertain and forces reconciliation before any next action', async () => {
  const f = fixture({ registerResponse: {} });
  await assert.rejects(
    () => withLive(() => f.provider.cancel(input, { invoiceId: 'inv_test' })),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'NFSE_EVENT_RESPONSE_INCOMPLETE' && error.retryable,
  );
  assert.equal(f.postCalls(), 1);
  assert.equal(f.saved.filter((item) => item.kind === 'cancellation-request-xml').length, 1);
  assert.equal(f.saved.filter((item) => item.kind === 'cancellation-event-xml').length, 0);
});
