export interface ReferenceCalculation {
  kind: '2026-test-reference';
  referenceOnly: true;
  base: number;
  rates: { ibs: number; cbs: number; total: number };
  amounts: { ibs: number; cbs: number; total: number };
}

function money(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function rate(value: number): number { return Number(value.toFixed(9)); }

export function calculate2026StandardReference(amount: number, effectiveAt: string, treatment: string): ReferenceCalculation | null {
  const year = new Date(`${effectiveAt.slice(0, 10)}T12:00:00Z`).getUTCFullYear();
  if (year !== 2026 || treatment !== 'standard') return null;
  const ibsRate = 0.001;
  const cbsRate = 0.009;
  const totalRate = rate(ibsRate + cbsRate);
  return {
    kind: '2026-test-reference',
    referenceOnly: true,
    base: money(amount),
    rates: { ibs: ibsRate, cbs: cbsRate, total: totalRate },
    amounts: { ibs: money(amount * ibsRate), cbs: money(amount * cbsRate), total: money(amount * totalRate) },
  };
}
