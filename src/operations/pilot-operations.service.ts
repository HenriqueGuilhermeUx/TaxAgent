import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

export const PILOT_OPERATION_STATUSES = [
  'ACTION_REQUIRED',
  'READY_FOR_ASSESSMENT',
  'READY_FOR_PREFLIGHT',
  'HOMOLOGATION_READY',
  'PARTIAL_VERIFICATION',
  'PREFLIGHT_BLOCKED',
] as const;

export type PilotOperationStatus = typeof PILOT_OPERATION_STATUSES[number];

export interface PilotOperationsFilters {
  environment: FiscalEnvironment;
  organizationId?: string;
  status?: PilotOperationStatus;
  route?: string;
  provider?: string;
  blocker?: string;
  q?: string;
  limit: number;
  offset: number;
}

interface QueueRow {
  company_id: string;
  organization_id: string;
  company_name: string;
  tax_id: string;
  city_code: string;
  municipal_registration: string | null;
  tax_regime: string | null;
  company_created_at: Date | string;
  company_updated_at: Date | string | null;
  onboarding_id: string | null;
  onboarding_status: string | null;
  onboarding_route: string | null;
  onboarding_provider: string | null;
  onboarding_blockers: unknown;
  onboarding_snapshot: unknown;
  onboarding_sha256: string | null;
  onboarding_created_at: Date | string | null;
  preflight_id: string | null;
  preflight_status: string | null;
  preflight_route: string | null;
  preflight_provider: string | null;
  preflight_blockers: unknown;
  preflight_sha256: string | null;
  preflight_created_at: Date | string | null;
}

interface QueueItem {
  company: {
    id: string;
    organization_id: string;
    name: string;
    tax_id: string;
    city_code: string;
    municipal_registration: string | null;
    tax_regime: string | null;
    updated_at: Date | string | null;
  };
  pilot_status: PilotOperationStatus;
  route: { resolved_route: string | null; resolved_provider: string | null };
  blockers: string[];
  next_action: Record<string, unknown>;
  freshness: {
    onboarding: 'MISSING' | 'CURRENT' | 'STALE';
    preflight: 'MISSING' | 'CURRENT' | 'STALE';
    company_changed_since_assessment: boolean;
  };
  evidence: {
    onboarding: Record<string, unknown> | null;
    preflight: Record<string, unknown> | null;
  };
  last_activity_at: Date | string;
  transmission: {
    allowed: false;
    fiscal_post_attempted: false;
    fiscal_transmission_attempted: false;
    fiscal_emission_attempted: false;
  };
}

const MAX_SCAN = 2000;

@Injectable()
export class PilotOperationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(filters: PilotOperationsFilters) {
    const { rows } = await this.db.query<QueueRow>(
      `WITH latest_onboarding AS (
         SELECT DISTINCT ON (company_id)
           id, company_id, status, route, provider, blockers, snapshot, snapshot_sha256, created_at
         FROM fiscal_onboarding_attestations
         WHERE environment=$1 AND assessment_type='onboarding'
         ORDER BY company_id, created_at DESC
       ),
       latest_preflight AS (
         SELECT DISTINCT ON (company_id)
           id, company_id, status, route, provider, blockers, snapshot_sha256, created_at
         FROM fiscal_onboarding_attestations
         WHERE environment=$1 AND assessment_type='preflight'
         ORDER BY company_id, created_at DESC
       )
       SELECT
         c.id AS company_id,
         c.organization_id,
         c.name AS company_name,
         c.tax_id,
         c.city_code,
         c.municipal_registration,
         c.tax_regime,
         c.created_at AS company_created_at,
         c.updated_at AS company_updated_at,
         o.id AS onboarding_id,
         o.status AS onboarding_status,
         o.route AS onboarding_route,
         o.provider AS onboarding_provider,
         o.blockers AS onboarding_blockers,
         o.snapshot AS onboarding_snapshot,
         o.snapshot_sha256 AS onboarding_sha256,
         o.created_at AS onboarding_created_at,
         p.id AS preflight_id,
         p.status AS preflight_status,
         p.route AS preflight_route,
         p.provider AS preflight_provider,
         p.blockers AS preflight_blockers,
         p.snapshot_sha256 AS preflight_sha256,
         p.created_at AS preflight_created_at
       FROM companies c
       LEFT JOIN latest_onboarding o ON o.company_id=c.id
       LEFT JOIN latest_preflight p ON p.company_id=c.id
       WHERE ($2::text IS NULL OR c.organization_id=$2)
       ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.id
       LIMIT ${MAX_SCAN + 1}`,
      [filters.environment, filters.organizationId ?? null],
    );

    const scanTruncated = rows.length > MAX_SCAN;
    const scannedRows = rows.slice(0, MAX_SCAN);
    let items = scannedRows.map((row) => toQueueItem(row));

    if (filters.q) {
      const q = filters.q.trim().toLowerCase();
      items = items.filter((item) => [item.company.name, item.company.tax_id, item.company.city_code]
        .some((value) => String(value).toLowerCase().includes(q)));
    }

    const summary = summarize(items);
    const baseTotal = items.length;

    if (filters.status) items = items.filter((item) => item.pilot_status === filters.status);
    if (filters.route) items = items.filter((item) => item.route.resolved_route === filters.route);
    if (filters.provider) items = items.filter((item) => item.route.resolved_provider === filters.provider);
    if (filters.blocker) items = items.filter((item) => item.blockers.includes(filters.blocker!));

    items.sort(compareOperationalAttention);
    const filteredTotal = items.length;
    const page = items.slice(filters.offset, filters.offset + filters.limit);

    return {
      environment: filters.environment,
      generated_at: new Date().toISOString(),
      summary,
      coverage: {
        scanned_companies: scannedRows.length,
        base_total: baseTotal,
        scan_limit: MAX_SCAN,
        scan_truncated: scanTruncated,
      },
      filters: {
        organization_id: filters.organizationId ?? null,
        status: filters.status ?? null,
        route: filters.route ?? null,
        provider: filters.provider ?? null,
        blocker: filters.blocker ?? null,
        q: filters.q ?? null,
      },
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        filtered_total: filteredTotal,
        has_more: filters.offset + filters.limit < filteredTotal,
      },
      items: page,
      safeguards: {
        source: 'persisted_attestations_only',
        provider_network_attempted: false,
        fiscal_post_attempted: false,
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
      },
    };
  }
}

export function toQueueItem(row: QueueRow): QueueItem {
  const companyReferenceTime = timestamp(row.company_updated_at ?? row.company_created_at);
  const onboardingTime = timestamp(row.onboarding_created_at);
  const preflightTime = timestamp(row.preflight_created_at);
  const companyChanged = Boolean(row.onboarding_id) && companyReferenceTime > onboardingTime;
  const onboardingFresh = Boolean(row.onboarding_id) && !companyChanged;
  const preflightMatchesRoute = row.preflight_route === row.onboarding_route && row.preflight_provider === row.onboarding_provider;
  const preflightFresh = Boolean(row.preflight_id) && onboardingFresh && preflightTime >= onboardingTime && preflightMatchesRoute;

  const pilotStatus = derivePilotStatus(row, onboardingFresh, preflightFresh);
  const blockers = activeBlockers(row, pilotStatus, companyChanged);
  const lastActivity = Math.max(companyReferenceTime, onboardingTime, preflightTime);

  return {
    company: {
      id: row.company_id,
      organization_id: row.organization_id,
      name: row.company_name,
      tax_id: row.tax_id,
      city_code: row.city_code,
      municipal_registration: row.municipal_registration,
      tax_regime: row.tax_regime,
      updated_at: row.company_updated_at,
    },
    pilot_status: pilotStatus,
    route: {
      resolved_route: row.onboarding_route,
      resolved_provider: row.onboarding_provider,
    },
    blockers,
    next_action: nextAction(row, pilotStatus, blockers),
    freshness: {
      onboarding: !row.onboarding_id ? 'MISSING' : onboardingFresh ? 'CURRENT' : 'STALE',
      preflight: !row.preflight_id ? 'MISSING' : preflightFresh ? 'CURRENT' : 'STALE',
      company_changed_since_assessment: companyChanged,
    },
    evidence: {
      onboarding: row.onboarding_id ? {
        id: row.onboarding_id,
        status: row.onboarding_status,
        snapshot_sha256: row.onboarding_sha256,
        created_at: row.onboarding_created_at,
        immutable_evidence: true,
      } : null,
      preflight: row.preflight_id ? {
        id: row.preflight_id,
        status: row.preflight_status,
        snapshot_sha256: row.preflight_sha256,
        created_at: row.preflight_created_at,
        immutable_evidence: true,
      } : null,
    },
    last_activity_at: new Date(Number.isFinite(lastActivity) ? lastActivity : Date.now()).toISOString(),
    transmission: {
      allowed: false,
      fiscal_post_attempted: false,
      fiscal_transmission_attempted: false,
      fiscal_emission_attempted: false,
    },
  };
}

function derivePilotStatus(row: QueueRow, onboardingFresh: boolean, preflightFresh: boolean): PilotOperationStatus {
  if (!onboardingFresh) return 'READY_FOR_ASSESSMENT';
  if (row.onboarding_status !== 'READY_FOR_HOMOLOGATION') return 'ACTION_REQUIRED';
  if (!preflightFresh) return 'READY_FOR_PREFLIGHT';
  if (row.preflight_status === 'PREFLIGHT_OK') return 'HOMOLOGATION_READY';
  if (row.preflight_status === 'PREFLIGHT_PARTIAL') return 'PARTIAL_VERIFICATION';
  return 'PREFLIGHT_BLOCKED';
}

function activeBlockers(row: QueueRow, status: PilotOperationStatus, companyChanged: boolean): string[] {
  if (status === 'READY_FOR_ASSESSMENT') {
    return [companyChanged ? 'company_changed_since_last_assessment' : 'assessment_required'];
  }
  if (status === 'ACTION_REQUIRED') return stringArray(row.onboarding_blockers);
  if (status === 'READY_FOR_PREFLIGHT') return ['preflight_required'];
  if (status === 'PARTIAL_VERIFICATION' || status === 'PREFLIGHT_BLOCKED') return stringArray(row.preflight_blockers);
  return [];
}

function nextAction(row: QueueRow, status: PilotOperationStatus, blockers: string[]): Record<string, unknown> {
  const runPath = `/v1/operations/onboarding/${row.company_id}/pilot/run`;
  switch (status) {
    case 'READY_FOR_ASSESSMENT':
      return { kind: 'RUN_ASSESSMENT', method: 'POST', path: runPath, description: 'Reavaliar a empresa e, se localmente pronta, executar o preflight seguro.' };
    case 'ACTION_REQUIRED': {
      const snapshotAction = firstSnapshotAction(row.onboarding_snapshot);
      return snapshotAction ?? {
        kind: 'RESOLVE_ONBOARDING_BLOCKERS',
        description: 'Resolver os blockers locais de onboarding antes de qualquer preflight.',
        blockers,
      };
    }
    case 'READY_FOR_PREFLIGHT':
      return { kind: 'RUN_PREFLIGHT', method: 'POST', path: runPath, description: 'Executar o preflight não emissor e persistir nova evidência.' };
    case 'HOMOLOGATION_READY':
      return { kind: 'AUTHORIZED_HOMOLOGATION_TEST', description: 'Empresa pronta para teste fiscal autorizado em homologação; transmissão continua fechada.', requires_explicit_authorization: true };
    case 'PARTIAL_VERIFICATION':
      return { kind: 'COMPLETE_PROVIDER_VERIFICATION', description: 'Completar a verificação segura ainda não suportada para a rota/provedor.', blockers };
    case 'PREFLIGHT_BLOCKED':
      return { kind: 'RESOLVE_PREFLIGHT_BLOCKERS', method: 'POST', path: runPath, description: 'Corrigir os blockers do preflight e executá-lo novamente.', blockers };
  }
}

function firstSnapshotAction(snapshot: unknown): Record<string, unknown> | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const actions = (snapshot as Record<string, unknown>).next_actions;
  if (!Array.isArray(actions) || !actions[0] || typeof actions[0] !== 'object') return null;
  return { kind: 'RESOLVE_ONBOARDING_BLOCKERS', ...(actions[0] as Record<string, unknown>) };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function summarize(items: QueueItem[]) {
  const counts = Object.fromEntries(PILOT_OPERATION_STATUSES.map((status) => [status.toLowerCase(), 0])) as Record<string, number>;
  for (const item of items) counts[item.pilot_status.toLowerCase()] += 1;
  return {
    total_companies: items.length,
    action_required: counts.action_required,
    ready_for_assessment: counts.ready_for_assessment,
    ready_for_preflight: counts.ready_for_preflight,
    homologation_ready: counts.homologation_ready,
    partial_verification: counts.partial_verification,
    preflight_blocked: counts.preflight_blocked,
  };
}

function compareOperationalAttention(a: QueueItem, b: QueueItem): number {
  const rank: Record<PilotOperationStatus, number> = {
    ACTION_REQUIRED: 0,
    READY_FOR_ASSESSMENT: 1,
    PREFLIGHT_BLOCKED: 2,
    PARTIAL_VERIFICATION: 3,
    READY_FOR_PREFLIGHT: 4,
    HOMOLOGATION_READY: 5,
  };
  const byStatus = rank[a.pilot_status] - rank[b.pilot_status];
  if (byStatus !== 0) return byStatus;
  return timestamp(b.last_activity_at) - timestamp(a.last_activity_at);
}
