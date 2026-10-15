import { BadRequestException, Injectable } from '@nestjs/common';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { TenancyService } from '../tenancy/tenancy.service';
import { UpdatePilotIntakeProfileDto } from './dto/update-pilot-intake-profile.dto';
import { PilotEnrollmentService } from './pilot-enrollment.service';
import { PilotOnboardingService } from './pilot-onboarding.service';

@Injectable()
export class PilotIntakeService {
  constructor(
    private readonly enrollment: PilotEnrollmentService,
    private readonly tenancy: TenancyService,
    private readonly pilot: PilotOnboardingService,
  ) {}

  async status(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const enrollment = await this.activeEnrollment(companyId, environment);
    const journey = await this.pilot.status(companyId, environment, this.effectiveDate(effectiveAt));
    return this.present(enrollment, journey);
  }

  async updateProfile(
    companyId: string,
    environment: FiscalEnvironment,
    dto: UpdatePilotIntakeProfileDto,
    effectiveAt?: string,
  ) {
    const enrollment = await this.activeEnrollment(companyId, environment);
    const patch: Record<string, string> = {};
    if (dto.city_code !== undefined) patch.city_code = dto.city_code.trim();
    if (dto.municipal_registration !== undefined) patch.municipal_registration = this.nonEmpty(dto.municipal_registration, 'municipal_registration');
    if (dto.tax_regime !== undefined) patch.tax_regime = this.nonEmpty(dto.tax_regime, 'tax_regime');
    if (!Object.keys(patch).length) throw new BadRequestException('At least one non-secret fiscal profile field is required');

    await this.tenancy.updateCompany(companyId, patch);
    const journey = await this.pilot.run(companyId, environment, this.effectiveDate(effectiveAt));
    return this.present(enrollment, journey, { profile_updated: true, orchestrator_advanced: true });
  }

  async advance(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const enrollment = await this.activeEnrollment(companyId, environment);
    const journey = await this.pilot.run(companyId, environment, this.effectiveDate(effectiveAt));
    return this.present(enrollment, journey, { profile_updated: false, orchestrator_advanced: true });
  }

  private async activeEnrollment(companyId: string, environment: FiscalEnvironment) {
    const enrollment = await this.enrollment.get(companyId, environment);
    if (enrollment.status !== 'active') {
      throw new BadRequestException(`Pilot enrollment is ${enrollment.status}; intake requires an active enrollment`);
    }
    return enrollment;
  }

  private present(
    enrollment: Awaited<ReturnType<PilotEnrollmentService['get']>>,
    rawJourney: Awaited<ReturnType<PilotOnboardingService['status']>> | Awaited<ReturnType<PilotOnboardingService['run']>>,
    operation: { profile_updated: boolean; orchestrator_advanced: boolean } = { profile_updated: false, orchestrator_advanced: false },
  ) {
    const journey = rawJourney as any;
    const companyId = String(enrollment.company_id);
    const channels = secureChannels(companyId);
    const stages = Array.isArray(journey.stages)
      ? journey.stages.map((stage: Record<string, unknown>) => ({
          ...stage,
          intake_channel: channelForStage(String(stage.id ?? ''), channels),
        }))
      : [];

    return {
      enrollment: {
        id: enrollment.id,
        company_id: enrollment.company_id,
        environment: enrollment.environment,
        label: enrollment.label,
        source: enrollment.source,
        status: enrollment.status,
        enrolled_at: enrollment.enrolled_at,
        updated_at: enrollment.updated_at,
      },
      company: journey.company ?? enrollment.company,
      environment: journey.environment ?? enrollment.environment,
      pilot_status: journey.pilot_status ?? 'ACTION_REQUIRED',
      onboarding_status: journey.onboarding_status ?? null,
      route: journey.route ?? null,
      blockers: Array.isArray(journey.blockers) ? journey.blockers : [],
      stages,
      next_action: journey.next_action ?? null,
      evidence: journey.evidence ?? null,
      run: journey.run ?? null,
      ready_for_authorized_homologation_test: journey.pilot_status === 'HOMOLOGATION_READY',
      secure_channels: channels,
      operation,
      safeguards: {
        intake_endpoints_accept_secrets: false,
        certificate_secret_material_channel: 'certificate-vault-only',
        provider_secret_material_channel: 'encrypted-provider-credentials-only',
        provider_credentials_verification: 'provider-specific-fail-closed',
        preflight_only_when_onboarding_ready: true,
        fiscal_post_attempted: false,
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
      },
      checked_at: new Date().toISOString(),
    };
  }

  private effectiveDate(value?: string): string | undefined {
    if (value === undefined) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('effective_at must use YYYY-MM-DD');
    return value;
  }

  private nonEmpty(value: string, field: string): string {
    const trimmed = value.trim();
    if (!trimmed) throw new BadRequestException(`${field} cannot be empty`);
    return trimmed;
  }
}

function secureChannels(companyId: string) {
  return {
    pilot_profile: {
      purpose: 'Non-secret company fiscal profile',
      method: 'POST',
      path: `/v1/operations/pilots/${companyId}/intake/profile`,
      authorization: 'bootstrap-token',
      accepted_fields: ['city_code', 'municipal_registration', 'tax_regime'],
      accepts_secret_material: false,
    },
    a1_certificate: {
      purpose: 'A1 PKCS#12 secure upload',
      method: 'POST',
      path: `/v1/companies/${companyId}/certificates/upload`,
      content_type: 'multipart/form-data',
      authorization: 'company-api-key',
      required_scope: 'certificates:write',
      handled_by: 'certificate-vault',
      secret_fields: ['file', 'password'],
      secrets_returned: false,
      after_success: { method: 'POST', path: `/v1/operations/pilots/${companyId}/intake/advance` },
    },
    provider_credentials: {
      purpose: 'Municipal/provider credential secure storage',
      method: 'POST',
      path: `/v1/companies/${companyId}/provider-credentials`,
      content_type: 'application/json',
      authorization: 'company-api-key',
      required_scope: 'credentials:write',
      handled_by: 'encrypted-provider-credentials',
      secrets_returned: false,
      verification: 'remains pending until a provider-specific safe verification proves it; intake never self-verifies credentials',
      after_success: { method: 'POST', path: `/v1/operations/pilots/${companyId}/intake/advance` },
    },
    advance: {
      purpose: 'Persist onboarding evidence and run preflight only when locally ready',
      method: 'POST',
      path: `/v1/operations/pilots/${companyId}/intake/advance`,
      authorization: 'bootstrap-token',
      accepts_secret_material: false,
      fiscal_transmission_allowed: false,
    },
  };
}

function channelForStage(stageId: string, channels: ReturnType<typeof secureChannels>) {
  switch (stageId) {
    case 'company_profile':
    case 'municipal_registration':
      return channels.pilot_profile;
    case 'a1_certificate':
      return channels.a1_certificate;
    case 'provider_credentials':
      return channels.provider_credentials;
    case 'onboarding_attestation':
    case 'provider_preflight':
      return channels.advance;
    case 'route_resolution':
      return { purpose: 'Resolved by TaxAgent fiscal router', accepts_secret_material: false };
    default:
      return null;
  }
}
