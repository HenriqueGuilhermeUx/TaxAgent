import { Injectable } from '@nestjs/common';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { FiscalOnboardingService } from './fiscal-onboarding.service';
import { GissWsdlDiagnosticService } from './giss-wsdl-diagnostic.service';
import { NationalPreflightService } from './national-preflight.service';

@Injectable()
export class FiscalOnboardingPreflightService {
  constructor(
    private readonly onboarding: FiscalOnboardingService,
    private readonly national: NationalPreflightService,
    private readonly giss: GissWsdlDiagnosticService,
  ) {}

  async run(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const onboarding = await this.onboarding.inspect(companyId, environment, effectiveAt);

    if (environment !== 'test') {
      return this.blocked(onboarding, ['homologation_environment_required'], 'Preflight automático é restrito ao ambiente test.');
    }

    if (onboarding.status !== 'READY_FOR_HOMOLOGATION') {
      return this.blocked(onboarding, onboarding.blockers, 'Onboarding local incompleto; nenhuma conexão de preflight foi aberta.');
    }

    if (onboarding.route.resolved_route === 'national-direct' && onboarding.route.resolved_provider === 'nfse-national') {
      const result = await this.national.probe(companyId, environment, onboarding.company.city_code);
      const mtlsAuthorized = Boolean(result.mtls?.authorized);
      const municipalityPresent = Boolean(result.municipality_parameters?.municipality_present);
      const ok = mtlsAuthorized && municipalityPresent;
      return {
        company_id: companyId,
        environment,
        status: ok ? 'PREFLIGHT_OK' : 'PREFLIGHT_BLOCKED',
        route: onboarding.route,
        onboarding_status: onboarding.status,
        provider_preflight: {
          provider: 'nfse-national',
          mtls_authorized: mtlsAuthorized,
          mtls_protocol: result.mtls?.protocol ?? null,
          official_endpoint: result.national_endpoint?.official ?? false,
          municipality_http_status: result.municipality_parameters?.http_status ?? null,
          municipality_present: municipalityPresent,
        },
        blockers: ok ? [] : [
          ...(!mtlsAuthorized ? ['national_mtls_not_authorized'] : []),
          ...(!municipalityPresent ? ['national_municipality_parameters_unavailable'] : []),
        ],
        safeguards: safeguards(['TLS_HANDSHAKE', 'GET']),
      };
    }

    if (onboarding.route.resolved_route === 'municipal-provider' && onboarding.route.resolved_provider === 'giss') {
      const result = await this.giss.inspect(companyId, environment, onboarding.company.city_code);
      const transport = result.emission_transport;
      const reachable = result.reachable !== false;
      const transportPresent = Boolean(transport?.transport_present);
      const shapePresent = Boolean(transport?.shape_present);
      const wrapperMappingVerified = Boolean(transport?.wrapper_mapping_verified);
      const ok = reachable && transportPresent && shapePresent && wrapperMappingVerified;
      return {
        company_id: companyId,
        environment,
        status: ok ? 'PREFLIGHT_OK' : 'PREFLIGHT_BLOCKED',
        route: onboarding.route,
        onboarding_status: onboarding.status,
        provider_preflight: {
          provider: 'giss',
          reachable,
          is_wsdl: result.isWsdl ?? result.is_wsdl ?? null,
          transport_present: transportPresent,
          shape_present: shapePresent,
          wrapper_mapping_verified: wrapperMappingVerified,
          soap_version: transport?.soap_version ?? null,
          request_wrapper: transport?.request_wrapper ?? null,
        },
        blockers: ok ? [] : [
          ...(!reachable ? ['giss_wsdl_unreachable'] : []),
          ...(!transportPresent ? ['giss_emission_transport_missing'] : []),
          ...(!shapePresent ? ['giss_emission_shape_missing'] : []),
          ...(!wrapperMappingVerified ? ['giss_wrapper_mapping_unverified'] : []),
        ],
        safeguards: safeguards(['GET']),
      };
    }

    if (onboarding.route.resolved_route === 'gateway') {
      return {
        company_id: companyId,
        environment,
        status: 'PREFLIGHT_PARTIAL',
        route: onboarding.route,
        onboarding_status: onboarding.status,
        provider_preflight: {
          provider: onboarding.route.resolved_provider,
          capability_confirmed: Boolean(onboarding.gateway?.covered),
          issuer_auth_preflight_supported: false,
        },
        blockers: ['gateway_issuer_auth_preflight_not_implemented'],
        note: 'Gateway capability foi comprovada por GET, mas a autenticação do emissor ainda não possui um probe não emissor confiável. Transmissão segue bloqueada.',
        safeguards: safeguards(['GET']),
      };
    }

    return this.blocked(onboarding, ['fiscal_route_unresolved'], 'Nenhuma rota fiscal verificável foi resolvida.');
  }

  private blocked(onboarding: Awaited<ReturnType<FiscalOnboardingService['inspect']>>, blockers: string[], note: string) {
    return {
      company_id: onboarding.company.id,
      environment: onboarding.environment,
      status: 'PREFLIGHT_BLOCKED',
      route: onboarding.route,
      onboarding_status: onboarding.status,
      provider_preflight: null,
      blockers,
      note,
      safeguards: safeguards([]),
    };
  }
}

function safeguards(networkMethods: string[]) {
  return {
    network_methods: networkMethods,
    fiscal_post_attempted: false,
    fiscal_transmission_attempted: false,
    fiscal_emission_attempted: false,
    certificate_private_material_exposed: false,
    provider_secrets_exposed: false,
  };
}
