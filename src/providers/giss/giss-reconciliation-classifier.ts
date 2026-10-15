import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { GissResponse } from './giss-response.parser';

export type GissReconciliationClassification =
  | { state: 'authorized'; nfseNumber: string; verificationCode?: string; protocol?: string }
  | { state: 'not_found'; code: string }
  | { state: 'unknown'; code?: string; message?: string; detailCode?: string; detailMessage?: string };

export function classifyGissReconciliation(
  response: GissResponse,
  verifiedNotFoundCodes: readonly string[] = [],
): GissReconciliationClassification {
  if (response.authorized && response.nfseNumber) {
    return {
      state: 'authorized',
      nfseNumber: response.nfseNumber,
      verificationCode: response.verificationCode,
      protocol: response.protocol,
    };
  }

  const code = response.errorCode?.trim();
  if (code && verifiedNotFoundCodes.includes(code)) return { state: 'not_found', code };

  if (!response.authorized) {
    return {
      state: 'unknown',
      code,
      message: response.errorMessage,
      detailCode: response.detailCode,
      detailMessage: response.detailMessage,
    };
  }

  throw new FiscalEngineError(
    'TA_GISS_RECONCILIATION_AMBIGUOUS',
    'GISS reconciliation response was neither an authorized NFS-e nor a verified not-found result.',
    false,
    { transmission_attempted: false, query_attempted: true },
  );
}
