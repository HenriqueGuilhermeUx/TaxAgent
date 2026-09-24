import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';

interface CancellationEventMetadata {
  accessKey?: unknown;
  eventType?: unknown;
  eventSequence?: unknown;
  reconciled?: unknown;
}

export interface CancellationEventIdentity {
  accessKey: string;
  eventType: string;
  eventSequence: number;
  eventId?: string;
}

const NATIONAL_ACCESS_KEY = /^[0-9]{8}(?:1[0-9]{14}|2[0-9A-Z]{14})[0-9]{27}$/;

export function assertCancellationEventDocument(xml: string, metadata: unknown): CancellationEventIdentity {
  const meta = metadata && typeof metadata === 'object' ? metadata as CancellationEventMetadata : {};
  const accessKey = typeof meta.accessKey === 'string' ? meta.accessKey.toUpperCase() : '';
  const eventType = typeof meta.eventType === 'string' ? meta.eventType : '';
  const eventSequence = typeof meta.eventSequence === 'number' ? meta.eventSequence : Number(meta.eventSequence);
  const errorCode = meta.reconciled === true ? 'NFSE_EVENT_RECONCILIATION_INCOMPLETE' : 'NFSE_EVENT_RESPONSE_INCOMPLETE';

  if (!NATIONAL_ACCESS_KEY.test(accessKey) || eventType !== '101101' || eventSequence !== 1) {
    throw new FiscalEngineError(
      errorCode,
      'Cancellation event document metadata is incomplete or does not identify the expected national event 101101/1.',
      true,
      { fiscal_retransmission_attempted: false, cancellation_state_confirmed: false },
    );
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new FiscalEngineError(
      errorCode,
      'SEFIN returned a malformed cancellation event XML. TaxAgent will preserve reconciliation state instead of marking the invoice cancelled.',
      true,
      { fiscal_retransmission_attempted: false, cancellation_state_confirmed: false },
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml) as Record<string, unknown>;
  } catch {
    throw new FiscalEngineError(
      errorCode,
      'SEFIN cancellation event XML could not be parsed. TaxAgent will preserve reconciliation state.',
      true,
      { fiscal_retransmission_attempted: false, cancellation_state_confirmed: false },
    );
  }

  const event = localChild(parsed, 'evento');
  const info = localChild(event, 'infEvento');
  const returnedAccessKey = scalar(localChild(info, 'chNFSe'))?.toUpperCase();
  const specific = localChild(info, `e${eventType}`);
  const sequenceRaw = scalar(localChild(info, 'nSeqEvento'));
  const returnedSequence = sequenceRaw ? Number(sequenceRaw) : undefined;
  const eventId = attribute(info, 'Id') ?? attribute(info, 'id');

  if (!event || !info || !specific) {
    throw identityError(errorCode, 'SEFIN response is not a registered cancellation event 101101 document.');
  }
  if (returnedAccessKey !== accessKey) {
    throw identityError(errorCode, 'SEFIN cancellation event references a different NFS-e access key.');
  }
  if (returnedSequence !== undefined && returnedSequence !== eventSequence) {
    throw identityError(errorCode, 'SEFIN cancellation event sequence does not match the reconciled 101101/1 identity.');
  }
  if (eventId) {
    const normalizedEventId = eventId.toUpperCase();
    const expectedPrefix = `EVT${accessKey}${eventType}`;
    if (!normalizedEventId.startsWith(expectedPrefix)) {
      throw identityError(errorCode, 'SEFIN cancellation event Id does not match the expected NFS-e/event identity.');
    }
    const suffix = normalizedEventId.slice(expectedPrefix.length);
    if (suffix && /^\d{3}$/.test(suffix) && Number(suffix) !== eventSequence) {
      throw identityError(errorCode, 'SEFIN cancellation event Id carries an unexpected event sequence.');
    }
  }

  return { accessKey, eventType, eventSequence, eventId };
}

function localChild(value: unknown, localName: string): any {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const key = Object.keys(record).find((candidate) => candidate.split(':').at(-1) === localName);
  return key ? record[key] : undefined;
}

function scalar(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (typeof record['#text'] === 'string' || typeof record['#text'] === 'number') return String(record['#text']);
  }
  return undefined;
}

function attribute(value: unknown, name: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const direct = record[`@_${name}`];
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct);
  return undefined;
}

function identityError(code: string, message: string): FiscalEngineError {
  return new FiscalEngineError(
    code,
    `${message} TaxAgent will preserve cancellation reconciliation state and will not confirm cancellation from this document.`,
    true,
    { fiscal_retransmission_attempted: false, cancellation_state_confirmed: false },
  );
}
