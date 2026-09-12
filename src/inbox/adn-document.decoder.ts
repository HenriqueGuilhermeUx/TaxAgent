import { gunzipSync } from 'node:zlib';

export interface DecodedAdnDocument {
  nsu: string;
  accessKey?: string;
  documentType?: string;
  eventType?: string;
  generatedAt?: string;
  content?: Buffer;
  contentType?: string;
  metadata: Record<string, unknown>;
}

function value(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  return undefined;
}

function maybeXml(candidate: unknown): { content?: Buffer; contentType?: string } {
  if (typeof candidate !== 'string') return {};
  const trimmed = candidate.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('<')) return { content: Buffer.from(trimmed, 'utf8'), contentType: 'application/xml' };

  try {
    const binary = Buffer.from(trimmed, 'base64');
    if (!binary.length) return {};
    let decoded = binary;
    if (binary.length > 2 && binary[0] === 0x1f && binary[1] === 0x8b) decoded = gunzipSync(binary);
    const text = decoded.toString('utf8').trim();
    if (text.startsWith('<')) return { content: Buffer.from(text, 'utf8'), contentType: 'application/xml' };
    return { content: decoded, contentType: 'application/octet-stream' };
  } catch {
    return {};
  }
}

export function extractAdnEntries(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const lote = value(root, 'LoteDFe', 'loteDFe', 'loteDfe');
  if (Array.isArray(lote)) return lote.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  if (lote && typeof lote === 'object') {
    const object = lote as Record<string, unknown>;
    for (const candidate of [object.DFe, object.dFe, object.Documentos, object.documentos, object.Itens, object.itens]) {
      if (Array.isArray(candidate)) return candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
    }
    if (value(object, 'NSU', 'nsu') !== undefined) return [object];
  }
  if (value(root, 'NSU', 'nsu') !== undefined) return [root];
  return [];
}

export function decodeAdnDocument(entry: Record<string, unknown>): DecodedAdnDocument | null {
  const nsuRaw = value(entry, 'NSU', 'nsu');
  if (nsuRaw === undefined) return null;
  const nsu = String(nsuRaw).replace(/\D/g, '');
  if (!nsu) return null;

  const xmlCandidate = value(entry, 'ArquivoXml', 'arquivoXml', 'ArquivoXML', 'XML', 'xml');
  const decoded = maybeXml(xmlCandidate);
  return {
    nsu,
    accessKey: value(entry, 'ChaveAcesso', 'chaveAcesso') ? String(value(entry, 'ChaveAcesso', 'chaveAcesso')) : undefined,
    documentType: value(entry, 'TipoDocumento', 'tipoDocumento') ? String(value(entry, 'TipoDocumento', 'tipoDocumento')) : undefined,
    eventType: value(entry, 'TipoEvento', 'tipoEvento') ? String(value(entry, 'TipoEvento', 'tipoEvento')) : undefined,
    generatedAt: value(entry, 'DataHoraGeracao', 'dataHoraGeracao') ? String(value(entry, 'DataHoraGeracao', 'dataHoraGeracao')) : undefined,
    ...decoded,
    metadata: entry,
  };
}
