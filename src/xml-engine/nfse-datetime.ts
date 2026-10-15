const NFSE_BRAZIL_OFFSET_HOURS = -3;

export function formatNfseDateTimeUtc(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid NFS-e date/time');

  // SEFIN processes NFS-e Nacional in Brazil civil time. Emitting the same
  // instant as +00:00 can make dhEmi appear hours ahead of the provider's
  // processing clock and trigger E0008.
  const shifted = new Date(date.getTime() + NFSE_BRAZIL_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '-03:00');
}
