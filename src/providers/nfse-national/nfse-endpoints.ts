import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../../fiscal-core/fiscal.types';

const OFFICIAL_ENDPOINTS: Record<FiscalEnvironment, { hostname: string; path: string }> = {
  test: {
    hostname: 'sefin.producaorestrita.nfse.gov.br',
    path: '/API/SefinNacional',
  },
  production: {
    hostname: 'sefin.nfse.gov.br',
    path: '/SefinNacional',
  },
};

export interface NfseEndpointPolicy {
  environment: FiscalEnvironment;
  configured: boolean;
  official: boolean;
  customAllowed: boolean;
  url?: string;
  expectedHost: string;
  expectedPath: string;
}

export function nfseEndpointPolicy(environment: FiscalEnvironment): NfseEndpointPolicy {
  const raw = environment === 'production' ? process.env.NFSE_PRODUCTION_BASE_URL : process.env.NFSE_TEST_BASE_URL;
  const expected = OFFICIAL_ENDPOINTS[environment];
  const customAllowed = process.env.TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS === 'true';
  if (!raw) return { environment, configured: false, official: false, customAllowed, expectedHost: expected.hostname, expectedPath: expected.path };
  try {
    const url = new URL(raw);
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
    const official = url.protocol === 'https:' && url.hostname.toLowerCase() === expected.hostname && normalizedPath.toLowerCase() === expected.path.toLowerCase();
    return { environment, configured: true, official, customAllowed, url: url.toString(), expectedHost: expected.hostname, expectedPath: expected.path };
  } catch {
    return { environment, configured: true, official: false, customAllowed, url: raw, expectedHost: expected.hostname, expectedPath: expected.path };
  }
}

export function resolveNfseBase(environment: FiscalEnvironment): string {
  const policy = nfseEndpointPolicy(environment);
  if (!policy.configured || !policy.url) {
    throw new FiscalEngineError('TA_NFSE_ENDPOINT_MISSING', `NFS-e base URL not configured for ${environment}`, false);
  }
  let url: URL;
  try { url = new URL(policy.url); }
  catch { throw new FiscalEngineError('TA_NFSE_ENDPOINT_INVALID', `NFS-e base URL is invalid for ${environment}`, false); }
  if (url.protocol !== 'https:') {
    throw new FiscalEngineError('TA_NFSE_ENDPOINT_INSECURE', 'NFS-e endpoint must use HTTPS because the A1 certificate is used for mTLS', false);
  }
  if (!policy.official && !policy.customAllowed) {
    throw new FiscalEngineError(
      'TA_NFSE_ENDPOINT_UNTRUSTED',
      `Refusing to present a private A1 certificate to non-official endpoint ${url.hostname}${url.pathname}. Set TAXAGENT_ALLOW_CUSTOM_NFSE_ENDPOINTS=true only for an explicitly trusted private integration endpoint.`,
      false,
    );
  }
  return url.toString().endsWith('/') ? url.toString() : `${url.toString()}/`;
}
