import { PDFParse } from 'pdf-parse';

export const DANFSE_PDF_TEXT_ADAPTER_VERSION = 'pdf-parse@2.4.5';
export const DANFSE_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const DANFSE_PDF_PARSE_TIMEOUT_MS = 10_000;

export type DanfsePdfTextErrorCode =
  | 'too_large'
  | 'invalid_pdf'
  | 'timeout'
  | 'no_text'
  | 'parse_failed';

export class DanfsePdfTextError extends Error {
  constructor(public readonly code: DanfsePdfTextErrorCode) {
    super(`DANFSe PDF text extraction failed: ${code}`);
    this.name = 'DanfsePdfTextError';
  }
}

export interface DanfsePdfTextResult {
  text: string;
  pages: number;
  adapterVersion: string;
}

function hasPdfSignature(data: Buffer): boolean {
  return data.length >= 5 && data.subarray(0, 5).toString('ascii') === '%PDF-';
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let handle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        handle = setTimeout(() => reject(new DanfsePdfTextError('timeout')), timeoutMs);
        handle.unref?.();
      }),
    ]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

export async function extractDanfsePdfText(
  data: Buffer,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<DanfsePdfTextResult> {
  const maxBytes = options.maxBytes ?? DANFSE_PDF_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DANFSE_PDF_PARSE_TIMEOUT_MS;

  if (data.length > maxBytes) throw new DanfsePdfTextError('too_large');
  if (!hasPdfSignature(data)) throw new DanfsePdfTextError('invalid_pdf');

  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: new Uint8Array(data) });
    const result = await withTimeout(parser.getText(), timeoutMs);
    const text = typeof result.text === 'string' ? result.text : '';
    if (!text.trim()) throw new DanfsePdfTextError('no_text');

    return {
      text,
      pages: Number.isInteger(result.total) ? result.total : result.pages?.length ?? 0,
      adapterVersion: DANFSE_PDF_TEXT_ADAPTER_VERSION,
    };
  } catch (error) {
    if (error instanceof DanfsePdfTextError) throw error;
    // Deliberately suppress parser error bodies/messages. They may contain
    // document content, password hints, object names or implementation detail.
    throw new DanfsePdfTextError('parse_failed');
  } finally {
    if (parser) {
      try { await parser.destroy(); } catch { /* cleanup errors are non-observable */ }
    }
  }
}
