export function formatNfseDateTimeUtc(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid NFS-e date/time');
  return date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}
