import { BadRequestException, Injectable } from '@nestjs/common';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { PilotOnboardingService } from '../operations/pilot-onboarding.service';
import { TenancyService } from '../tenancy/tenancy.service';
import { UpdateCustomerFiscalProfileDto } from './dto/update-customer-fiscal-profile.dto';

@Injectable()
export class CustomerFiscalService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly pilot: PilotOnboardingService,
  ) {}

  async status(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    return this.present(await this.pilot.status(companyId, environment, this.effectiveDate(effectiveAt)));
  }

  async updateProfile(companyId: string, environment: FiscalEnvironment, dto: UpdateCustomerFiscalProfileDto, effectiveAt?: string) {
    const patch: Record<string, string> = {};
    if (dto.city_code !== undefined) patch.city_code = dto.city_code.trim();
    if (dto.municipal_registration !== undefined) patch.municipal_registration = this.nonEmpty(dto.municipal_registration, 'municipal_registration');
    if (dto.tax_regime !== undefined) patch.tax_regime = this.nonEmpty(dto.tax_regime, 'tax_regime');
    if (!Object.keys(patch).length) throw new BadRequestException('At least one non-secret fiscal profile field is required');
    await this.tenancy.updateCompany(companyId, patch);
    return this.present(await this.pilot.run(companyId, environment, this.effectiveDate(effectiveAt)), { profile_updated: true, advanced: true });
  }

  async advance(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    return this.present(await this.pilot.run(companyId, environment, this.effectiveDate(effectiveAt)), { profile_updated: false, advanced: true });
  }

  private present(rawJourney: any, operation = { profile_updated: false, advanced: false }) {
    const companyId = String(rawJourney?.company?.id ?? '');
    const channels = secureChannels(companyId);
    const stages = Array.isArray(rawJourney?.stages)
      ? rawJourney.stages.map((stage: Record<string, unknown>) => ({ ...stage, action: customerAction(String(stage.id ?? ''), channels) }))
      : [];
    return {
      company: rawJourney.company ?? null,
      environment: rawJourney.environment ?? null,
      effective_at: rawJourney.effective_at ?? null,
      fiscal_status: rawJourney.pilot_status ?? 'ACTION_REQUIRED',
      onboarding_status: rawJourney.onboarding_status ?? null,
      route: rawJourney.route ?? null,
      stages,
      blockers: Array.isArray(rawJourney.blockers) ? rawJourney.blockers : [],
      next_action: rawJourney.next_action ?? null,
      evidence: rawJourney.evidence ?? null,
      ready_for_authorized_homologation_test: rawJourney.pilot_status === 'HOMOLOGATION_READY',
      secure_channels: channels,
      operation,
      safeguards: {
        bootstrap_token_required_by_customer: false,
        profile_accepts_secret_material: false,
        certificate_secret_material_channel: 'certificate-vault-only',
        provider_secret_material_channel: 'encrypted-provider-credentials-only',
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
    profile: { method: 'POST', path: `/v1/portal/companies/${companyId}/fiscal/profile`, authorization: 'company-api-key', required_scope: 'operations:write', accepts_secret_material: false },
    a1_certificate: { method: 'POST', path: `/v1/companies/${companyId}/certificates/upload`, authorization: 'company-api-key', required_scope: 'certificates:write', content_type: 'multipart/form-data', handled_by: 'certificate-vault', secrets_returned: false },
    provider_credentials: { method: 'POST', path: `/v1/companies/${companyId}/provider-credentials`, authorization: 'company-api-key', required_scope: 'credentials:write', handled_by: 'encrypted-provider-credentials', secrets_returned: false },
    advance: { method: 'POST', path: `/v1/portal/companies/${companyId}/fiscal/advance`, authorization: 'company-api-key', required_scope: 'operations:write', fiscal_transmission_allowed: false },
  };
}

function customerAction(stageId: string, channels: ReturnType<typeof secureChannels>) {
  switch (stageId) {
    case 'company_profile':
    case 'municipal_registration': return channels.profile;
    case 'a1_certificate': return channels.a1_certificate;
    case 'provider_credentials': return channels.provider_credentials;
    case 'onboarding_attestation':
    case 'provider_preflight': return channels.advance;
    case 'route_resolution': return { purpose: 'Resolved automatically by TaxAgent fiscal router', accepts_secret_material: false };
    default: return null;
  }
}
