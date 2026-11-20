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


export type OfficialRtcSimplesDatasetStatus = 'match' | 'mismatch' | 'unknown';

export interface OfficialRtcSimplesFreshnessAssessment {
  status: OfficialRtcSimplesDatasetStatus;
  authoritative_eligible: boolean;
  pinned_release: string;
  local_release_matches_pin: boolean;
  application_reference_verified: boolean;
  dataset_current: boolean;
  local: OfficialRtcVersionSnapshot;
  reference: OfficialRtcVersionSnapshot;
  blockers: string[];
}

export function assessOfficialRtcSimplesFreshness(
  pinnedRelease: string,
  payload: unknown,
): OfficialRtcSimplesFreshnessAssessment {
  const root = asRecord(payload);
  const local: OfficialRtcVersionSnapshot = root ? {
    app: typeof root.versaoAplicacaoLocal === 'string' ? root.versaoAplicacaoLocal : undefined,
    database: typeof root.versaoDbLocal === 'string' ? root.versaoDbLocal : undefined,
    databaseDate: typeof root.dataDbLocal === 'string' ? root.dataDbLocal : undefined,
    environment: 'offline',
  } : {};
  const reference: OfficialRtcVersionSnapshot = root ? {
    // The upstream offline comparator may point at the shared RTC online service.
    // Do not treat versaoAplicacaoRemota as a verified Simples application version.
    database: typeof root.versaoDbRemota === 'string' ? root.versaoDbRemota : undefined,
    databaseDate: typeof root.dataDbRemota === 'string' ? root.dataDbRemota : undefined,
    environment: 'online-reference',
  } : {};

  const pinned = semverCore(pinnedRelease);
  const localApp = semverCore(local.app);
  const localReleaseMatchesPin = !!pinned && !!localApp && compareTuple(localApp, pinned) === 0;
  const dbCurrent = root?.dbAtualizada === true;
  const dbDateCurrent = root?.dataDbAtualizada === true;
  const hasDatasetEvidence = !!local.database && !!reference.database && !!local.databaseDate && !!reference.databaseDate;
  const status: OfficialRtcSimplesDatasetStatus = !hasDatasetEvidence
    ? 'unknown'
    : dbCurrent && dbDateCurrent
      ? 'match'
      : 'mismatch';

  const blockers: string[] = [];
  if (!localReleaseMatchesPin) blockers.push('pinned_release_integrity_unverified');
  if (status !== 'match') blockers.push(status === 'unknown' ? 'shared_tax_dataset_freshness_unknown' : 'shared_tax_dataset_mismatch');
  blockers.push('simples_application_reference_unverified');

  return {
    status,
    authoritative_eligible: false,
    pinned_release: pinnedRelease,
    local_release_matches_pin: localReleaseMatchesPin,
    application_reference_verified: false,
    dataset_current: status === 'match',
    local,
    reference,
    blockers,
  };
}
