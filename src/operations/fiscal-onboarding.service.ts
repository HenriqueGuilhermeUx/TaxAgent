import { Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { GatewayCapabilityService } from '../municipal-parameters/gateway-capability.service';
import { MunicipalCapabilityService } from '../municipal-parameters/municipal-capability.service';
import { ProviderCredentialsService } from '../provider-credentials/provider-credentials.service';
import { TenancyService } from '../tenancy/tenancy.service';

interface CompanyRecord {
  id: string;
  name: string;
  tax_id: string;
  municipal_registration?: string | null;
  city_code: string;
  tax_regime?: string | null;
}

interface PublicProviderCredential {
  provider: string;
  environment: FiscalEnvironment;
  credential_keys: string[];
  status: 'pending' | 'verified' | 'disabled';
  verified_at?: Date | string | null;
}

interface GatewayCapability {
  provider: string;
  configured: boolean;
  covered: boolean;
  transmissionEnabled: boolean;
  reason?: string;
  municipality?: { id?: string | number; name?: string; state?: string; pattern?: string | null };
  requirements?: {
    certificate?: boolean | null;
    login?: boolean | null;
    password?: boolean | null;
    certificateUpload?: boolean | null;
    sequentialNumbering?: boolean | null;
    substitution?: boolean | null;
  };
  evidence?: Record<string, unknown>;
}

interface RequirementResult {
  id: string;
  label: string;
  required: boolean;
  satisfied: boolean;
  source: string;
  detail?: string;
}

@Injectable()
export class FiscalOnboardingService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly certificates: CertificateVaultService,
    private readonly capabilities: MunicipalCapabilityService,
    private readonly gatewayCapabilities: GatewayCapabilityService,
    private readonly providerCredentials: ProviderCredentialsService,
  ) {}

  async inspect(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const taxRegime = normalizeRegime(company.tax_regime);
    const effectiveDate = (effectiveAt ?? new Date().toISOString()).slice(0, 10);

    const [route, certificateRows, credentials] = await Promise.all([
      this.capabilities.resolve(company.city_code, environment, {
        taxRegime: taxRegime === 'unknown' ? undefined : taxRegime,
        effectiveAt: effectiveDate,
      }),
      this.certificates.metadata(companyId),
      this.providerCredentials.list(companyId),
    ]);

    const certificate = certificateState(certificateRows as Array<Record<string, unknown>>, company.tax_id);
    const providerCredentials = credentials as PublicProviderCredential[];
    const requirements: RequirementResult[] = [
      requirement('city_code', 'Município IBGE válido', true, /^\d{7}$/.test(company.city_code), 'company'),
      requirement('tax_regime', 'Regime tributário informado', true, taxRegime !== 'unknown', 'company'),
    ];

    let resolvedRoute: 'national-direct' | 'municipal-provider' | 'gateway' | 'unresolved' = 'unresolved';
    let resolvedProvider: string = route.provider;
    let gateway: GatewayCapability | null = null;

    if (route.route === 'national-direct' && route.provider === 'nfse-national' && route.nationalPublicIssuer) {
      resolvedRoute = 'national-direct';
      resolvedProvider = 'nfse-national';
      requirements.push(...certificateRequirements(certificate));
      requirements.push(requirement(
        'national_live_builder_tax_regime',
        'Regime suportado pelo builder nacional de homologação atual',
        true,
        taxRegime === 'regular',
        'taxagent-live-builder',
        taxRegime === 'regular' ? undefined : 'O builder nacional live atual permanece limitado ao regime regular.',
      ));
    } else if (route.route === 'municipal-provider' && route.provider === 'giss') {
      resolvedRoute = 'municipal-provider';
      resolvedProvider = 'giss';
      requirements.push(requirement(
        'municipal_registration',
        'Inscrição Municipal',
        true,
        Boolean(String(company.municipal_registration ?? '').trim()),
        'giss-onboarding',
      ));
      requirements.push(...certificateRequirements(certificate));
    } else {
      gateway = await this.gatewayCapabilities.resolve(company.city_code, environment) as GatewayCapability;
      if (gateway.configured && gateway.covered) {
        resolvedRoute = 'gateway';
        resolvedProvider = gateway.provider;
        requirements.push(requirement(
          'municipal_registration',
          'Inscrição Municipal',
          true,
          Boolean(String(company.municipal_registration ?? '').trim()),
          'gateway-onboarding',
        ));

        const needsCertificate = gateway.requirements?.certificate === true || gateway.requirements?.certificateUpload === true;
        if (needsCertificate) requirements.push(...certificateRequirements(certificate));

        const requiredCredentialKeys: string[] = [];
        if (gateway.requirements?.login === true) requiredCredentialKeys.push('login');
        if (gateway.requirements?.password === true) requiredCredentialKeys.push('password');
        if (requiredCredentialKeys.length) {
          const credential = providerCredentials.find((item) => item.provider === gateway?.provider && item.environment === environment);
          const verified = credential?.status === 'verified';
          const keys = new Set((credential?.credential_keys ?? []).map((item) => item.toLowerCase()));
          const loginPresent = !requiredCredentialKeys.includes('login') || hasAny(keys, ['login', 'usuario', 'username', 'user']);
          const passwordPresent = !requiredCredentialKeys.includes('password') || hasAny(keys, ['password', 'senha']);
          const credentialsSatisfied = Boolean(verified && loginPresent && passwordPresent);
          requirements.push(requirement(
            'provider_credentials',
            'Credenciais municipais do emissor',
            true,
            credentialsSatisfied,
            'gateway-capability',
            credentialsSatisfied
              ? undefined
              : credential
                ? credential.status === 'verified'
                  ? 'Credenciais verificadas, mas faltam campos exigidos pelo município.'
                  : `Credenciais cadastradas com status ${credential.status}; verificação ainda necessária.`
                : 'Credenciais exigidas pelo município ainda não foram cadastradas.',
          ));
        }
      } else {
        requirements.push(requirement(
          'fiscal_route',
          'Rota fiscal verificável',
          true,
          false,
          'fiscal-router',
          gateway.reason ?? 'Nenhuma rota nativa ou gateway comprovado para este município.',
        ));
      }
    }

    const blockers = requirements.filter((item) => item.required && !item.satisfied).map((item) => item.id);
    const ready = blockers.length === 0 && resolvedRoute !== 'unresolved';
    const nextActions = requirements
      .filter((item) => item.required && !item.satisfied)
      .map((item) => ({ requirement: item.id, action: nextAction(item.id, resolvedProvider) }));

    const result = {
      company: {
        id: company.id,
        name: company.name,
        tax_id_masked: maskTaxId(company.tax_id),
        city_code: company.city_code,
        tax_regime: taxRegime,
        municipal_registration_present: Boolean(String(company.municipal_registration ?? '').trim()),
      },
      environment,
      effective_at: effectiveDate,
      status: ready ? 'READY_FOR_HOMOLOGATION' : 'BLOCKED',
      route: {
        resolved_route: resolvedRoute,
        resolved_provider: resolvedProvider,
        native_route: route.route,
        native_provider: route.provider,
        national_public_issuer: route.nationalPublicIssuer,
        evidence_source: route.source,
        confidence: route.confidence,
      },
      gateway: gateway ? {
        provider: gateway.provider,
        configured: gateway.configured,
        covered: gateway.covered,
        municipality: gateway.municipality ?? null,
        requirements: gateway.requirements ?? null,
        evidence: gateway.evidence ?? null,
      } : null,
      certificate,
      requirements,
      blockers,
      next_actions: nextActions,
      transmission: {
        allowed: false,
        reason: 'safety_gate_locked',
        onboarding_ready: ready,
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
      },
      secrets_exposed: false,
      checked_at: new Date().toISOString(),
    };

    console.log(JSON.stringify({
      event: 'fiscal_onboarding_result',
      company_id: company.id,
      environment,
      city_code: company.city_code,
      tax_regime: taxRegime,
      status: result.status,
      resolved_route: resolvedRoute,
      resolved_provider: resolvedProvider,
      blockers,
      fiscal_transmission_attempted: false,
      fiscal_emission_attempted: false,
    }));

    return result;
  }
}

function certificateState(rows: Array<Record<string, unknown>>, companyTaxId: string) {
  const active = rows.find((item) => item.status === 'active');
  const validTo = active?.valid_to ? new Date(String(active.valid_to)) : null;
  const valid = Boolean(validTo && Number.isFinite(validTo.getTime()) && validTo.getTime() > Date.now());
  const companyBinding = Boolean(active && normalizeTaxId(String(active.subject_tax_id ?? '')) === normalizeTaxId(companyTaxId));
  return {
    active: Boolean(active),
    valid,
    company_binding: companyBinding,
    valid_to: validTo?.toISOString() ?? null,
    private_material_exposed: false,
  };
}

function certificateRequirements(certificate: { active: boolean; valid: boolean; company_binding: boolean }): RequirementResult[] {
  return [
    requirement('active_a1', 'Certificado A1 ativo', true, certificate.active, 'certificate-vault'),
    requirement('valid_a1', 'Certificado A1 dentro da validade', true, certificate.valid, 'certificate-vault'),
    requirement('certificate_company_binding', 'CNPJ do A1 confere com a empresa', true, certificate.company_binding, 'certificate-vault'),
  ];
}

function requirement(id: string, label: string, required: boolean, satisfied: boolean, source: string, detail?: string): RequirementResult {
  return { id, label, required, satisfied, source, ...(detail ? { detail } : {}) };
}

function nextAction(requirementId: string, provider: string): string {
  switch (requirementId) {
    case 'tax_regime': return 'Informar o regime tributário real da empresa.';
    case 'municipal_registration': return 'Cadastrar a Inscrição Municipal real da empresa.';
    case 'active_a1':
    case 'valid_a1':
    case 'certificate_company_binding': return 'Enviar um certificado A1 válido pertencente ao mesmo CNPJ da empresa.';
    case 'provider_credentials': return `Cadastrar e validar as credenciais exigidas pelo provedor ${provider}.`;
    case 'national_live_builder_tax_regime': return 'Aguardar/implementar suporte do builder nacional para este regime antes da homologação live.';
    case 'fiscal_route': return 'Resolver uma rota oficial, adapter municipal nativo ou gateway comprovado para o município.';
    default: return `Resolver o requisito ${requirementId}.`;
  }
}

function hasAny(keys: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => keys.has(candidate));
}

function normalizeRegime(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase() || 'unknown';
}

function normalizeTaxId(value: string): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function maskTaxId(value: string): string {
  const normalized = normalizeTaxId(value);
  if (normalized.length <= 6) return '*'.repeat(normalized.length);
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.max(0, normalized.length - 6))}${normalized.slice(-4)}`;
}
