const known: Record<string, { category: string; retryable: boolean }> = {
  E1235: { category: 'schema', retryable: false },
  E1634: { category: 'certificate-standard', retryable: false },
  E1200: { category: 'transmission-certificate', retryable: false },
  E1229: { category: 'encoding', retryable: false },
  E1228: { category: 'namespace', retryable: false },
  E1225: { category: 'compression', retryable: false },
};

export function classifyNfseRejection(code: string | undefined) {
  if (!code) return { category: 'business-rule', retryable: false };
  return known[code] ?? { category: code.startsWith('E') ? 'business-rule' : 'unknown', retryable: false };
}
