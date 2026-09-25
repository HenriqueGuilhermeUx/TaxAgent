import { Injectable } from '@nestjs/common';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { FiscalOnboardingAuditService } from './fiscal-onboarding-audit.service';
import { FiscalOnboardingPreflightService } from './fiscal-onboarding-preflight.service';
import { FiscalOnboardingService } from './fiscal-onboarding.service';

type StageStatus = 'COMPLETE' | 'ACTION_REQUIRED' | 'NOT_REQUIRED' | 'NOT_RUN' | 'STALE' | 'PREFLIGHT_OK' | 'PREFLIGHT_PARTIAL' | 'PREFLIGHT_BLOCKED';
type PilotStatus = 'ACTION_REQUIRED' | 'READY_FOR_ASSESSMENT' | 'READY_FOR_PREFLIGHT' | 'HOMOLOGATION_READY' | 'PARTIAL_VERIFICATION' | 'PREFLIGHT_BLOCKED';

interface RequirementLike {
  id: string;
  label: string;
  required: boolean;
  satisfied: boolean;
  source: string;
  detail?: string;
}

interface OnboardingLike {
  [key: string]: unknown;
  company: { id: string; name?: string; city_code: string; tax_regime?: string };
  environment: FiscalEnvironment;
  effective_at?: string;
  status: string;
  route: { resolved_route: string; resolved_provider: string };
  requirements: RequirementLike[];
  blockers: string[];
  next_actions?: Array<{ requirement: string; action: string }>;
  transmission?: { allowed?: boolean };
}

interface HistoryLike {
  id: string;
  environment: FiscalEnvironment;
  assessment_type: 'onboarding' | 'preflight';
  status: string;
  route: string | null;
  provider: string | null;
  blockers: unknown;
  snapshot_sha256: string;
  created_at: Date | string;
}

@Injectable()
export class PilotOnboardingService {
  constructor(
    private readonly onboarding: FiscalOnboardingService,
    private readonly preflight: FiscalOnboardingPreflightService,
    private readonly audit: FiscalOnboardingAuditService,
  ) {}

  async status(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const onboarding = await this.onboarding.inspect(companyId, environment, effectiveAt) as OnboardingLike;
    const history = await this.environmentHistory(companyId, environment);
    return this.compose(onboarding, history);
  }

  async run(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const onboarding = await this.onboarding.inspect(companyId, environment, effectiveAt) as OnboardingLike;
    const onboardingAttestation = await this.audit.record(companyId, 'onboarding', onboarding);

    if (onboarding.status !== 'READY_FOR_HOMOLOGATION') {
      const history = await this.environmentHistory(companyId, environment);
      return {
        ...this.compose(onboarding, history),
        run: {
          onboarding_attestation: onboardingAttestation,
          preflight_executed: false,
          preflight_attestation: null,
          stopped_before_provider_network: true,
          reason: 'onboarding_blocked',
        },
      };
    }

    const preflight = await this.preflight.run(companyId, environment, effectiveAt);
    const preflightAttestation = await this.audit.record(companyId, 'preflight', preflight);
    const history = await this.environmentHistory(companyId, environment);

    return {
      ...this.compose(onboarding, history),
      run: {
        onboarding_attestation: onboardingAttestation,
        preflight_executed: true,
        preflight_attestation: preflightAttestation,
        stopped_before_provider_network: false,
      },
    };
  }

  private async environmentHistory(companyId: string, environment: FiscalEnvironment): Promise<HistoryLike[]> {
    const history = await this.audit.list(companyId, 100) as HistoryLike[];
    return history.filter((item) => item.environment === environment);
  }

  private compose(onboarding: OnboardingLike, history: HistoryLike[]) {
    const requirements = onboarding.requirements ?? [];
    const latestOnboarding = history.find((item) => item.assessment_type === 'onboarding');
    const latestPreflight = history.find((item) => item.assessment_type === 'preflight');
    const onboardingEvidenceCurrent = evidenceMatches(latestOnboarding, onboarding);
    const preflightEvidenceCurrent = evidenceMatches(latestPreflight, onboarding);

    const stages = [
      requirementStage(
        'company_profile',
        'Empresa e enquadramento fiscal',
        requirements,
        ['city_code', 'tax_regime', 'national_live_builder_tax_regime'],
        `/v1/companies/${onboarding.company.id}`,
        'bootstrap-token',
      ),
      {
        id: 'route_resolution',
        label: 'Rota fiscal',
        status: onboarding.route.resolved_route === 'unresolved' ? 'ACTION_REQUIRED' as StageStatus : 'COMPLETE' as StageStatus,
        detail: onboarding.route.resolved_route === 'unresolved'
          ? 'Nenhuma rota fiscal comprovada foi resolvida.'
          : `${onboarding.route.resolved_route}:${onboarding.route.resolved_provider}`,
        action: onboarding.route.resolved_route === 'unresolved'
          ? { method: 'GET', path: `/v1/operations/onboarding/${onboarding.company.id}`, required_scope: 'operations:read' }
          : null,
      },
      requirementStage(
        'municipal_registration',
        'Inscrição Municipal',
        requirements,
        ['municipal_registration'],
        `/v1/companies/${onboarding.company.id}`,
        'bootstrap-token',
      ),
      requirementStage(
        'a1_certificate',
        'Certificado A1',
        requirements,
        ['active_a1', 'valid_a1', 'certificate_company_binding'],
        `/v1/companies/${onboarding.company.id}/certificates/upload`,
        'certificates:write',
      ),
      requirementStage(
        'provider_credentials',
        'Credenciais municipais/provedor',
        requirements,
        ['provider_credentials'],
        `/v1/companies/${onboarding.company.id}/provider-credentials`,
        'credentials:write',
      ),
      {
        id: 'onboarding_attestation',
        label: 'Evidência de onboarding',
        status: latestOnboarding ? (onboardingEvidenceCurrent ? 'COMPLETE' : 'STALE') : 'NOT_RUN',
        detail: latestOnboarding
          ? `Última attestation: ${String(latestOnboarding.created_at)} (${latestOnboarding.status}).`
          : 'Assessment ainda não foi persistido.',
        action: { method: 'POST', path: `/v1/operations/onboarding/${onboarding.company.id}/assess`, required_scope: 'operations:read' },
        evidence: latestOnboarding ? evidenceSummary(latestOnboarding) : null,
      },
      {
        id: 'provider_preflight',
        label: 'Preflight do provedor',
        status: preflightStageStatus(onboarding, latestPreflight, preflightEvidenceCurrent),
        detail: preflightDetail(onboarding, latestPreflight, preflightEvidenceCurrent),
        action: onboarding.status === 'READY_FOR_HOMOLOGATION'
          ? { method: 'POST', path: `/v1/operations/onboarding/${onboarding.company.id}/preflight`, required_scope: 'operations:read' }
          : null,
        evidence: latestPreflight ? evidenceSummary(latestPreflight) : null,
      },
    ];

    const status = pilotStatus(onboarding, latestOnboarding, onboardingEvidenceCurrent, latestPreflight, preflightEvidenceCurrent);
    const preflightBlockers = latestPreflight && Array.isArray(latestPreflight.blockers) ? latestPreflight.blockers.map(String) : [];
    const blockers = status === 'ACTION_REQUIRED'
      ? onboarding.blockers
      : status === 'PREFLIGHT_BLOCKED' || status === 'PARTIAL_VERIFICATION'
        ? preflightBlockers
        : [];

    return {
      company: onboarding.company,
      environment: onboarding.environment,
      effective_at: onboarding.effective_at ?? null,
      pilot_status: status,
      onboarding_status: onboarding.status,
      route: onboarding.route,
      stages,
      blockers,
      next_action: nextPilotAction(status, onboarding),
      evidence: {
        latest_onboarding: latestOnboarding ? evidenceSummary(latestOnboarding) : null,
        latest_preflight: latestPreflight ? evidenceSummary(latestPreflight) : null,
      },
      transmission: {
        allowed: false,
        reason: 'pilot_orchestrator_never_unlocks_fiscal_transmission',
        fiscal_post_attempted: false,
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
      },
      checked_at: new Date().toISOString(),
    };
  }
}

function requirementStage(
  id: string,
  label: string,
  requirements: RequirementLike[],
  ids: string[],
  actionPath: string,
  requiredScope: string,
) {
  const relevant = requirements.filter((item) => ids.includes(item.id) && item.required);
  if (relevant.length === 0) {
    return { id, label, status: 'NOT_REQUIRED' as StageStatus, detail: 'Não exigido pela rota resolvida.', action: null };
  }
  const missing = relevant.filter((item) => !item.satisfied);
  return {
    id,
    label,
    status: missing.length === 0 ? 'COMPLETE' as StageStatus : 'ACTION_REQUIRED' as StageStatus,
    detail: missing.length === 0 ? 'Requisitos satisfeitos.' : missing.map((item) => item.detail ?? item.label).join(' | '),
    requirements: relevant.map((item) => ({ id: item.id, satisfied: item.satisfied, source: item.source })),
    action: missing.length === 0 ? null : { method: id === 'a1_certificate' || id === 'provider_credentials' ? 'POST' : 'PATCH', path: actionPath, required_scope: requiredScope },
  };
}

function evidenceMatches(item: HistoryLike | undefined, onboarding: OnboardingLike): boolean {
  if (!item) return false;
  return item.route === onboarding.route.resolved_route && item.provider === onboarding.route.resolved_provider;
}

function evidenceSummary(item: HistoryLike) {
  return {
    id: item.id,
    status: item.status,
    route: item.route,
    provider: item.provider,
    snapshot_sha256: item.snapshot_sha256,
    created_at: item.created_at,
    immutable_evidence: true,
  };
}

function preflightStageStatus(onboarding: OnboardingLike, latest: HistoryLike | undefined, current: boolean): StageStatus {
  if (onboarding.status !== 'READY_FOR_HOMOLOGATION') return 'NOT_RUN';
  if (!latest) return 'NOT_RUN';
  if (!current) return 'STALE';
  if (latest.status === 'PREFLIGHT_OK') return 'PREFLIGHT_OK';
  if (latest.status === 'PREFLIGHT_PARTIAL') return 'PREFLIGHT_PARTIAL';
  return 'PREFLIGHT_BLOCKED';
}

function preflightDetail(onboarding: OnboardingLike, latest: HistoryLike | undefined, current: boolean): string {
  if (onboarding.status !== 'READY_FOR_HOMOLOGATION') return 'Aguardando resolução dos blockers locais de onboarding.';
  if (!latest) return 'Pronto para executar preflight não emissor.';
  if (!current) return 'A evidência existente pertence a outra rota/provedor e deve ser refeita.';
  return `Último preflight: ${latest.status} em ${String(latest.created_at)}.`;
}

function pilotStatus(
  onboarding: OnboardingLike,
  latestOnboarding: HistoryLike | undefined,
  onboardingCurrent: boolean,
  latestPreflight: HistoryLike | undefined,
  preflightCurrent: boolean,
): PilotStatus {
  if (onboarding.status !== 'READY_FOR_HOMOLOGATION') return 'ACTION_REQUIRED';
  if (!latestOnboarding || !onboardingCurrent) return 'READY_FOR_ASSESSMENT';
  if (!latestPreflight || !preflightCurrent) return 'READY_FOR_PREFLIGHT';
  if (latestPreflight.status === 'PREFLIGHT_OK') return 'HOMOLOGATION_READY';
  if (latestPreflight.status === 'PREFLIGHT_PARTIAL') return 'PARTIAL_VERIFICATION';
  return 'PREFLIGHT_BLOCKED';
}

function nextPilotAction(status: PilotStatus, onboarding: OnboardingLike) {
  switch (status) {
    case 'ACTION_REQUIRED':
      return onboarding.next_actions?.[0] ?? { action: 'Resolver os blockers locais indicados antes do preflight.' };
    case 'READY_FOR_ASSESSMENT':
      return { action: 'Persistir a attestation de onboarding.', method: 'POST', path: `/v1/operations/onboarding/${onboarding.company.id}/assess` };
    case 'READY_FOR_PREFLIGHT':
      return { action: 'Executar o preflight seguro e não emissor.', method: 'POST', path: `/v1/operations/onboarding/${onboarding.company.id}/preflight` };
    case 'HOMOLOGATION_READY':
      return { action: 'Empresa pronta para um teste fiscal autorizado em homologação. O gate de transmissão permanece fechado.' };
    case 'PARTIAL_VERIFICATION':
      return { action: 'Completar a verificação não emissora que ainda não é suportada para esta rota/provedor.' };
    case 'PREFLIGHT_BLOCKED':
      return { action: 'Corrigir os blockers retornados pelo último preflight e executá-lo novamente.' };
  }
}
