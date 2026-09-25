import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { TenancyService } from '../tenancy/tenancy.service';
import { EnrollPilotDto } from './dto/enroll-pilot.dto';
import { FiscalOnboardingAuditService } from './fiscal-onboarding-audit.service';
import { FiscalOnboardingService } from './fiscal-onboarding.service';

interface CompanyRecord {
  id: string;
  organization_id: string;
  name: string;
  tax_id: string;
  city_code: string;
  municipal_registration?: string | null;
  tax_regime?: string | null;
}

interface EnrollmentRow {
  id: string;
  company_id: string;
  environment: FiscalEnvironment;
  label: string | null;
  source: string | null;
  status: 'active' | 'paused' | 'completed';
  enrolled_at: Date | string;
  updated_at: Date | string;
  created?: boolean;
}

interface EnrollmentLookupRow extends EnrollmentRow {
  company_name: string;
  tax_id: string;
  city_code: string;
}

@Injectable()
export class PilotEnrollmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tenancy: TenancyService,
    private readonly onboarding: FiscalOnboardingService,
    private readonly audit: FiscalOnboardingAuditService,
  ) {}

  async enroll(dto: EnrollPilotDto, environment: FiscalEnvironment, effectiveAt?: string) {
    const effectiveDate = this.effectiveDate(effectiveAt);
    const resolved = await this.resolveCompany(dto);
    const enrollment = await this.upsertEnrollment(resolved.company.id, environment, dto.pilot_label, dto.source);
    const assessment = await this.onboarding.inspect(resolved.company.id, environment, effectiveDate);
    const attestation = await this.audit.record(resolved.company.id, 'onboarding', assessment);
    const requirements = Array.isArray((assessment as any).requirements) ? (assessment as any).requirements : [];
    const nextActions = Array.isArray((assessment as any).next_actions) ? (assessment as any).next_actions : [];
    const checklist = requirements.map((item: any) => ({
      id: String(item.id ?? ''),
      label: String(item.label ?? item.id ?? ''),
      required: Boolean(item.required),
      satisfied: Boolean(item.satisfied),
      source: item.source ?? null,
      detail: item.detail ?? null,
      action: nextActions.find((action: any) => action?.requirement === item.id)?.action ?? null,
    }));
    const ready = (assessment as any).status === 'READY_FOR_HOMOLOGATION';

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
        created: Boolean(enrollment.created),
      },
      company: {
        id: resolved.company.id,
        organization_id: resolved.company.organization_id,
        name: resolved.company.name,
        tax_id_masked: maskTaxId(resolved.company.tax_id),
        city_code: resolved.company.city_code,
        tax_regime: resolved.company.tax_regime ?? null,
        municipal_registration_present: Boolean(String(resolved.company.municipal_registration ?? '').trim()),
        created_during_enrollment: resolved.companyCreated,
        reused_by_tax_id: resolved.reusedByTaxId,
      },
      pilot_status: ready ? 'READY_FOR_PREFLIGHT' : 'ACTION_REQUIRED',
      route: (assessment as any).route ?? null,
      blockers: Array.isArray((assessment as any).blockers) ? (assessment as any).blockers : [],
      checklist,
      next_actions: nextActions,
      attestation,
      links: {
        pilot_status: `/v1/operations/onboarding/${resolved.company.id}/pilot`,
        pilot_run: `/v1/operations/onboarding/${resolved.company.id}/pilot/run`,
        evidence_history: `/v1/operations/onboarding/${resolved.company.id}/history`,
        operations_queue: `/v1/operations/pilots?environment=${environment}&q=${encodeURIComponent(normalizeTaxId(resolved.company.tax_id))}`,
      },
      safeguards: {
        preflight_attempted: false,
        fiscal_post_attempted: false,
        fiscal_transmission_attempted: false,
        fiscal_emission_attempted: false,
        secrets_accepted_by_endpoint: false,
      },
    };
  }

  async get(companyId: string, environment: FiscalEnvironment) {
    const { rows } = await this.db.query<EnrollmentLookupRow>(
      `SELECT e.id, e.company_id, e.environment, e.label, e.source, e.status, e.enrolled_at, e.updated_at,
              c.name AS company_name, c.tax_id, c.city_code
       FROM pilot_enrollments e
       JOIN companies c ON c.id=e.company_id
       WHERE e.company_id=$1 AND e.environment=$2`,
      [companyId, environment],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Pilot enrollment not found');
    return {
      id: row.id,
      company_id: row.company_id,
      environment: row.environment,
      label: row.label,
      source: row.source,
      status: row.status,
      enrolled_at: row.enrolled_at,
      updated_at: row.updated_at,
      company: {
        id: row.company_id,
        name: row.company_name,
        tax_id_masked: maskTaxId(row.tax_id),
        city_code: row.city_code,
      },
      transmission: { allowed: false, fiscal_transmission_attempted: false, fiscal_emission_attempted: false },
    };
  }

  private async resolveCompany(dto: EnrollPilotDto): Promise<{ company: CompanyRecord; companyCreated: boolean; reusedByTaxId: boolean }> {
    if (dto.company_id) {
      const incompatible = [dto.organization_id, dto.organization_name, dto.company_name, dto.tax_id, dto.city_code, dto.municipal_registration, dto.tax_regime]
        .some((value) => value !== undefined);
      if (incompatible) throw new BadRequestException('company_id cannot be combined with new-company fields');
      const company = await this.tenancy.getCompany(dto.company_id) as CompanyRecord;
      return { company, companyCreated: false, reusedByTaxId: false };
    }

    if (!dto.company_name || !dto.tax_id || !dto.city_code) {
      throw new BadRequestException('New pilot enrollment requires company_name, tax_id and city_code');
    }
    if (dto.organization_id && dto.organization_name) {
      throw new BadRequestException('Use either organization_id or organization_name, not both');
    }
    if (!dto.organization_id && !dto.organization_name) {
      throw new BadRequestException('New pilot enrollment requires organization_id or organization_name');
    }

    const normalizedTaxId = normalizeTaxId(dto.tax_id);
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM companies
       WHERE REGEXP_REPLACE(UPPER(tax_id), '[^A-Z0-9]', '', 'g')=$1
       LIMIT 1`,
      [normalizedTaxId],
    );
    if (existing.rows[0]?.id) {
      const company = await this.tenancy.getCompany(existing.rows[0].id) as CompanyRecord;
      return { company, companyCreated: false, reusedByTaxId: true };
    }

    let organizationId = dto.organization_id;
    if (!organizationId) {
      const organization = await this.tenancy.createOrganization(dto.organization_name!.trim()) as { id: string };
      organizationId = organization.id;
    }
    const company = await this.tenancy.createCompany(organizationId, {
      name: dto.company_name.trim(),
      tax_id: normalizedTaxId,
      city_code: dto.city_code,
      municipal_registration: clean(dto.municipal_registration),
      tax_regime: clean(dto.tax_regime),
    }) as CompanyRecord;
    return { company, companyCreated: true, reusedByTaxId: false };
  }

  private async upsertEnrollment(companyId: string, environment: FiscalEnvironment, label?: string, source?: string): Promise<EnrollmentRow> {
    const id = createId('pilot');
    const { rows } = await this.db.query<EnrollmentRow>(
      `INSERT INTO pilot_enrollments(id, company_id, environment, label, source, status)
       VALUES ($1,$2,$3,$4,$5,'active')
       ON CONFLICT (company_id, environment) DO UPDATE
       SET label=COALESCE(EXCLUDED.label, pilot_enrollments.label),
           source=COALESCE(EXCLUDED.source, pilot_enrollments.source),
           status='active',
           updated_at=NOW()
       RETURNING id, company_id, environment, label, source, status, enrolled_at, updated_at, (xmax = 0) AS created`,
      [id, companyId, environment, clean(label), clean(source)],
    );
    if (!rows[0]) throw new Error('Pilot enrollment was not persisted');
    return rows[0];
  }

  private effectiveDate(value?: string): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('effective_at must use YYYY-MM-DD');
    return value;
  }
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeTaxId(value: string): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function maskTaxId(value: string): string {
  const normalized = normalizeTaxId(value);
  if (normalized.length <= 6) return '*'.repeat(normalized.length);
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.max(0, normalized.length - 6))}${normalized.slice(-4)}`;
}
