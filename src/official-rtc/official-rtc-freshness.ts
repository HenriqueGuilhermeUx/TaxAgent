export type OfficialRtcFreshnessStatus = 'match' | 'reference_ahead' | 'pinned_ahead' | 'unknown';

export interface OfficialRtcVersionSnapshot {
  app?: string;
  database?: string;
  databaseDate?: string;
  environment?: string;
}

export interface OfficialRtcFreshnessAssessment {
  status: OfficialRtcFreshnessStatus;
  authoritative_eligible: boolean;
  pinned_release: string;
  reference: OfficialRtcVersionSnapshot;
}

function semverCore(value: string | undefined): [number, number, number] | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareTuple(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function extractOfficialRtcVersion(payload: unknown): OfficialRtcVersionSnapshot {
  const root = asRecord(payload);
  if (!root) return {};
  return {
    app: typeof root.versaoApp === 'string' ? root.versaoApp : undefined,
    database: typeof root.versaoDb === 'string' ? root.versaoDb : undefined,
    databaseDate: typeof root.dataVersaoDb === 'string' ? root.dataVersaoDb : undefined,
    environment: typeof root.ambiente === 'string' ? root.ambiente : undefined,
  };
}

export function assessOfficialRtcFreshness(pinnedRelease: string, payload: unknown): OfficialRtcFreshnessAssessment {
  const reference = extractOfficialRtcVersion(payload);
  const pinned = semverCore(pinnedRelease);
  const remote = semverCore(reference.app);

  if (!pinned || !remote) {
    return { status: 'unknown', authoritative_eligible: false, pinned_release: pinnedRelease, reference };
  }

  const cmp = compareTuple(remote, pinned);
  if (cmp === 0) {
    return { status: 'match', authoritative_eligible: true, pinned_release: pinnedRelease, reference };
  }
  if (cmp > 0) {
    return { status: 'reference_ahead', authoritative_eligible: false, pinned_release: pinnedRelease, reference };
  }
  return { status: 'pinned_ahead', authoritative_eligible: false, pinned_release: pinnedRelease, reference };
}
