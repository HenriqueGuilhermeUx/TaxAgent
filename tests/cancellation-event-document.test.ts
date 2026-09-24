import assert from 'node:assert/strict';
import test from 'node:test';
import { FiscalDocumentsService } from '../src/documents/fiscal-documents.service';
import { FiscalEngineError } from '../src/fiscal-core/fiscal-engine.error';
import { assertCancellationEventDocument } from '../src/documents/cancellation-event-document.validator';

const numericKey = '35306072200000000000000000000000000126090000000000';
const alphaKey = '35306072212ABC34501DE35000000000000126090000000000';

function eventXml(accessKey = numericKey, eventTag = 'e101101', sequence = '001') {
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
    `<infEvento Id="EVT${accessKey}101101${sequence}">` +
    `<chNFSe>${accessKey}</chNFSe>` +
    `<nSeqEvento>${sequence}</nSeqEvento>` +
    `<${eventTag}><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>1</cMotivo><xMotivo>Cancelamento de teste</xMotivo></${eventTag}>` +
    `</infEvento></evento>`;
}

const metadata = (accessKey = numericKey, reconciled = false) => ({
  accessKey,
  eventType: '101101',
  eventSequence: 1,
  reconciled,
});

test('accepts a registered national 101101 cancellation event for the exact NFS-e key', () => {
  const identity = assertCancellationEventDocument(eventXml(), metadata());
  assert.equal(identity.accessKey, numericKey);
  assert.equal(identity.eventType, '101101');
  assert.equal(identity.eventSequence, 1);
  assert.equal(identity.eventId, `EVT${numericKey}101101001`);
});

test('accepts the alphanumeric-CNPJ segment allowed by the active national access-key layout', () => {
  const identity = assertCancellationEventDocument(eventXml(alphaKey), metadata(alphaKey));
  assert.equal(identity.accessKey, alphaKey);
});

test('rejects cancellation event XML that references another NFS-e key', () => {
  const anotherKey = '35306072200000000000000000000000000226090000000000';
  assert.throws(
    () => assertCancellationEventDocument(eventXml(anotherKey), metadata()),
    (error: unknown) => error instanceof FiscalEngineError
      && error.code === 'NFSE_EVENT_RESPONSE_INCOMPLETE'
      && error.retryable === true,
  );
});

test('reconciled invalid event keeps the reconciliation-specific uncertainty code', () => {
  assert.throws(
    () => assertCancellationEventDocument(eventXml(numericKey, 'e105102'), metadata(numericKey, true)),
    (error: unknown) => error instanceof FiscalEngineError
      && error.code === 'NFSE_EVENT_RECONCILIATION_INCOMPLETE'
      && error.retryable === true,
  );
});

test('rejects an unexpected event sequence before cancellation can be confirmed', () => {
  assert.throws(
    () => assertCancellationEventDocument(eventXml(numericKey, 'e101101', '002'), metadata()),
    (error: unknown) => error instanceof FiscalEngineError
      && error.code === 'NFSE_EVENT_RESPONSE_INCOMPLETE',
  );
});

test('FiscalDocumentsService blocks invalid cancellation event before any database write', async () => {
  let dbCalls = 0;
  const service = new FiscalDocumentsService({
    async query() { dbCalls += 1; return { rows: [] }; },
  } as any);

  await assert.rejects(
    service.save({
      invoiceId: 'inv_test',
      kind: 'cancellation-event-xml',
      content: eventXml('35306072200000000000000000000000000226090000000000'),
      contentType: 'application/xml',
      metadata: metadata(),
    }),
    (error: unknown) => error instanceof FiscalEngineError && error.code === 'NFSE_EVENT_RESPONSE_INCOMPLETE',
  );
  assert.equal(dbCalls, 0);
});

test('FiscalDocumentsService persists a valid cancellation event and does not constrain unrelated document kinds', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const service = new FiscalDocumentsService({
    async query(sql: string, params: unknown[]) { calls.push({ sql, params }); return { rows: [] }; },
  } as any);

  const saved = await service.save({
    invoiceId: 'inv_test',
    kind: 'cancellation-event-xml',
    content: eventXml(),
    contentType: 'application/xml',
    metadata: metadata(),
  });
  assert.equal(saved.kind, 'cancellation-event-xml');
  assert.equal(calls.length, 1);

  await service.save({
    invoiceId: 'inv_test',
    kind: 'nfse-authorized-xml',
    content: '<not-an-event/>',
    contentType: 'application/xml',
    metadata: { accessKey: numericKey },
  });
  assert.equal(calls.length, 2);
});
