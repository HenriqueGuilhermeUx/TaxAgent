export class FiscalEngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FiscalEngineError';
  }
}

export function normalizeEngineError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof FiscalEngineError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  const maybeStatus = typeof error === 'object' && error !== null && 'getStatus' in error && typeof (error as { getStatus?: unknown }).getStatus === 'function'
    ? (error as { getStatus: () => number }).getStatus()
    : undefined;
  if (maybeStatus && maybeStatus >= 400 && maybeStatus < 500) {
    return { code: 'TA_INVALID_CONFIGURATION', message: error instanceof Error ? error.message : 'Invalid fiscal configuration', retryable: false };
  }
  return { code: 'TA_ENGINE_ERROR', message: error instanceof Error ? error.message : 'Unknown engine error', retryable: true };
}
