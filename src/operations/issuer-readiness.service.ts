import { Injectable } from '@nestjs/common';
import { CertificateVaultService } from '../certificates/certificate-vault.service';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalCapabilityService } from '../municipal-parameters/municipal-capability.service';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';
import { TenancyService } from '../tenancy/tenancy.service';

interface CompanyRecord {
  id: string;
  tax_id: string;
  city_code: string;
  tax_regime?: string | null;
  municipal_registration?: string | null;
}

@Injectable()
export class IssuerReadinessService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly certificates: CertificateVaultService,
    private readonly db: DatabaseService,
    private readonly capabilities: MunicipalCapabilityService,
    private readonly schemas: SchemaRegistryService,
  ) {}

  async inspect(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const company = await this.tenancy.getCompany(companyId) as CompanyRecord;
    const taxRegime = String(company.tax_regime ?? '').trim().toLowerCase() || 'unknown';
    const effectiveDate = (effectiveAt ?? new Date().toISOString()).slice(0, 10);
    const route = await this.capabilities.resolve(company.city_code, environment, {
      taxRegime: taxRegime === 'unknown' ? undefined : taxRegime,
      effectiveAt: effectiveDate,
    });

    const certificateMetadata = await this.certificates.metadata(companyId) as Array<{
      status: string;
      valid_to?: Date | string | null;
      subject_tax_id?: string | null;
    }>;
    const activeCertificate = certificateMetadata.find((item) => item.status === 'active');
    const certificateValidTo = activeCertificate?.valid_to ? new Date(activeCertificate.valid_to) : undefined;
    const certificateValid = Boolean(certificateValidTo && Number.isFinite(certificateValidTo.getTime()) && certificateValidTo.getTime() > Date.now());
    const certificateCompanyBinding = Boolean(
      activeCertificate
      && normalizeTaxId(activeCertificate.subject_tax_id ?? '') === normalizeTaxId(company.tax_id),
    );

    const dpsConformance = this.schemas.dpsConformance(environment);
    const eventConformance = this.schemas.eventConformance(environment);
    const liveBuilderTaxRegimeSupported = taxRegime === 'regular';
    const blockers: string[] = [];

    if (environment !== 'test') blockers.push('homologation_environment_required');
    if (route.route !== 'national-direct' || route.provider !== 'nfse-national' || !route.nationalPublicIssuer) blockers.push('issuer_route_not_national_direct');
    if (!activeCertificate || !certificateValid) blockers.push('active_a1_required');
    if (!certificateCompanyBinding) blockers.push('certificate_company_binding_required');
    if (!dpsConformance.verified) blockers.push('dps_conformance_required');
    if (!eventConformance.verified) blockers.push('event_conformance_required');
    if (!liveBuilderTaxRegimeSupported) blockers.push('tax_regime_not_yet_supported_by_live_dps_builder');

    const result = {
      company_id: companyId,
      environment,
      effective_at: effectiveDate,
      issuer_city_code: company.city_code,
      tax_regime: taxRegime,
      municipal_registration_present: Boolean(company.municipal_registration),
      route: {
        resolved_route: route.route,
        resolved_provider: route.provider,
        national_public_issuer: route.nationalPublicIssuer,
        source: route.source,
      },
      certificate: {
        active: Boolean(activeCertificate),
        valid: certificateValid,
        company_binding: certificateCompanyBinding,
      },
      conformance: {
        dps_verified: dpsConformance.verified,
        cancellation_event_verified: eventConformance.verified,
      },
      live_builder_tax_regime_supported: liveBuilderTaxRegimeSupported,
      eligible_for_national_test_issuance: blockers.length === 0,
      blockers,
      safeguards: {
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
        certificate_private_material_exposed: false,
        company_tax_id_exposed: false,
      },
    };

    // Safe operational diagnostic. No CNPJ, certificate bytes, API key, XML or taxpayer payload is logged.
    console.log(JSON.stringify({
      event: 'issuer_readiness_result',
      company_id: companyId,
      environment,
      effective_at: effectiveDate,
      issuer_city_code: company.city_code,
      tax_regime: taxRegime,
      resolved_route: route.route,
      resolved_provider: route.provider,
      national_public_issuer: route.nationalPublicIssuer,
      certificate_active: Boolean(activeCertificate),
      certificate_valid: certificateValid,
      certificate_company_binding: certificateCompanyBinding,
      dps_conformance_verified: dpsConformance.verified,
      event_conformance_verified: eventConformance.verified,
      live_builder_tax_regime_supported: liveBuilderTaxRegimeSupported,
      eligible_for_national_test_issuance: blockers.length === 0,
      blockers,
      fiscal_transmission_attempted: false,
      fiscal_emission_attempted: false,
    }));

    return result;
  }

  async coreEmissionStatus(companyId: string, environment: FiscalEnvironment, effectiveAt?: string) {
    const issuer = await this.inspect(companyId, environment, effectiveAt);
    const authorized = await this.db.query<{
      id: string;
      provider: string | null;
      access_key: string | null;
      updated_at: Date | string;
      authorized_xml_sha256: string | null;
      authorized_xml_created_at: Date | string | null;
    }>(
      `SELECT i.id, i.provider, i.access_key, i.updated_at,
              d.sha256 AS authorized_xml_sha256,
              d.created_at AS authorized_xml_created_at
         FROM invoices i
         LEFT JOIN LATERAL (
           SELECT sha256, created_at
             FROM fiscal_documents
            WHERE invoice_id=i.id AND kind='nfse-authorized-xml'
            ORDER BY created_at DESC
            LIMIT 1
         ) d ON TRUE
        WHERE i.company_id=$1
          AND i.environment=$2
          AND i.status='authorized'
          AND i.provider='nfse-national'
        ORDER BY i.updated_at DESC`,
      [companyId, environment],
    );

    const provenRows = authorized.rows.filter((row) => Boolean(row.access_key && row.authorized_xml_sha256));
    const proofCount = provenRows.length;
    const last = provenRows[0] ?? null;
    const cancellation = proofCount > 0
      ? await this.db.query<{ event_count: string; document_count: string }>(
          `SELECT
             (SELECT COUNT(*)::text
                FROM fiscal_events e
                JOIN invoices i ON i.id=e.invoice_id
               WHERE i.company_id=$1 AND i.environment=$2 AND i.provider='nfse-national'
                 AND e.event_type='cancellation') AS event_count,
             (SELECT COUNT(*)::text
                FROM fiscal_documents d
                JOIN invoices i ON i.id=d.invoice_id
               WHERE i.company_id=$1 AND i.environment=$2 AND i.provider='nfse-national'
                 AND d.kind='cancellation-event-xml') AS document_count`,
          [companyId, environment],
        )
      : { rows: [] as Array<{ event_count: string; document_count: string }> };
    const cancellationRow = cancellation.rows[0];
    const cancellationProven = Boolean(
      cancellationRow
      && Number(cancellationRow.event_count) > 0
      && Number(cancellationRow.document_count) > 0,
    );

    const stage = proofCount >= 10 && cancellationProven
      ? 'REPEATABLE_HOMOLOGATION'
      : proofCount > 0
        ? 'AUTHORIZED_PROOF_EXISTS'
        : issuer.eligible_for_national_test_issuance
          ? 'ELIGIBLE_NOT_YET_PROVEN'
          : 'BLOCKED_BEFORE_REAL_TEST';

    return {
      company_id: companyId,
      environment,
      stage,
      implementation: {
        fiscal_router: true,
        tax_decision: true,
        dps_xsd: true,
        certificate_vault_a1: true,
        xmldsig: true,
        prepared_dps: true,
        sefin_mtls_client: true,
        national_issue_post: true,
        reconciliation_by_dps: true,
        cancellation_event_101101: true,
        fiscal_ledger: true,
        webhooks: true,
      },
      issuer_readiness: issuer,
      official_proof: {
        proven_authorized_nfse_count: proofCount,
        proven_once: proofCount > 0,
        repeatability_target_met: proofCount >= 10,
        cancellation_event_proven: cancellationProven,
        last_proof: last ? {
          invoice_id: last.id,
          provider: last.provider,
          access_key_present: Boolean(last.access_key),
          authorized_xml_sha256: last.authorized_xml_sha256,
          authorized_xml_created_at: last.authorized_xml_created_at,
          authorized_at: last.updated_at,
        } : null,
      },
      truthful_answer: proofCount > 0
        ? 'TaxAgent has at least one persisted official National NFS-e authorization proof for this Company/environment.'
        : 'The National NFS-e emission core is implemented, but no persisted official authorization proof exists yet for this Company/environment.',
      safeguards: {
        fiscal_transmission_attempted_by_this_endpoint: false,
        secrets_exposed: false,
        access_key_exposed: false,
      },
    };
  }

}

function normalizeTaxId(value: string): string {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
