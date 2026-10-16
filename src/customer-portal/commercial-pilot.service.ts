import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { PilotEnrollmentService } from '../operations/pilot-enrollment.service';
import { CreatePilotApplicationDto, ConvertPilotApplicationDto, UpdatePilotApplicationStatusDto } from './dto/commercial-pilot.dto';

interface PilotApplicationRow {
  id:string;
  status:'new'|'contacted'|'qualified'|'accepted'|'rejected';
  contact_name:string;
  email:string;
  phone:string|null;
  company_name:string;
  tax_id:string|null;
  profile:'company'|'accounting_office'|'software';
  message:string|null;
  source:string;
  internal_note:string|null;
  company_id:string|null;
  enrollment_id:string|null;
  pilot_environment:'test'|'production'|null;
  converted_at:Date|string|null;
  created_at:Date|string;
  updated_at:Date|string;
}

@Injectable()
export class CommercialPilotService {
  constructor(
    private readonly db: DatabaseService,
    private readonly enrollment: PilotEnrollmentService,
  ) {}

  async create(input: CreatePilotApplicationDto) {
    const email = input.email.trim().toLowerCase();
    const companyName = input.company_name.trim();
    const existing = await this.db.query<{id:string;created_at:Date|string}>(
      `SELECT id, created_at FROM commercial_pilot_applications
       WHERE lower(email)=$1 AND lower(company_name)=lower($2)
         AND created_at > now() - interval '15 minutes'
       ORDER BY created_at DESC LIMIT 1`,
      [email, companyName],
    );
    if (existing.rows[0]) return this.publicResponse(existing.rows[0].id, existing.rows[0].created_at, true);

    const id = createId('pilotapp');
    const result = await this.db.query<{id:string;created_at:Date|string}>(
      `INSERT INTO commercial_pilot_applications(id,contact_name,email,phone,company_name,tax_id,profile,message,consent)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id,created_at`,
      [id,input.contact_name.trim(),email,clean(input.phone),companyName,clean(input.tax_id),input.profile,clean(input.message)],
    );
    return this.publicResponse(id, result.rows[0]?.created_at ?? new Date().toISOString(), false);
  }

  async list(status?: string, limit=100) {
    const safeLimit = Math.min(Math.max(Number(limit)||100,1),200);
    const {rows} = await this.db.query<PilotApplicationRow>(
      `SELECT id,status,contact_name,email,phone,company_name,tax_id,profile,message,source,internal_note,
              company_id,enrollment_id,pilot_environment,converted_at,created_at,updated_at
       FROM commercial_pilot_applications
       WHERE ($1::text IS NULL OR status=$1)
       ORDER BY created_at DESC LIMIT $2`,
      [status ?? null,safeLimit],
    );
    return {items:rows,count:rows.length};
  }

  async update(id:string,input:UpdatePilotApplicationStatusDto) {
    const {rows} = await this.db.query<PilotApplicationRow>(
      `UPDATE commercial_pilot_applications SET status=$2,internal_note=$3,updated_at=now()
       WHERE id=$1
       RETURNING id,status,contact_name,email,phone,company_name,tax_id,profile,message,source,internal_note,
                 company_id,enrollment_id,pilot_environment,converted_at,created_at,updated_at`,
      [id,input.status,clean(input.note)],
    );
    if (!rows[0]) throw new NotFoundException('Commercial pilot application not found');
    return rows[0];
  }

  async convertToPilot(id:string,input:ConvertPilotApplicationDto) {
    const app = await this.getApplication(id);
    if (app.enrollment_id && app.company_id) return this.conversionResponse(app, true);
    if (!['qualified','accepted'].includes(app.status)) {
      throw new BadRequestException('Application must be qualified before pilot conversion');
    }
    const taxId = clean(input.tax_id) ?? clean(app.tax_id);
    if (!taxId) throw new BadRequestException('tax_id is required before pilot conversion');

    const enrolled = await this.enrollment.enroll({
      organization_name: clean(input.organization_name) ?? app.company_name,
      company_name: app.company_name,
      tax_id: taxId,
      city_code: input.city_code,
      municipal_registration: clean(input.municipal_registration) ?? undefined,
      tax_regime: input.tax_regime.trim(),
      pilot_label: clean(input.pilot_label) ?? `Commercial pilot · ${app.company_name}`,
      source: `commercial:${app.id}`,
    }, 'test');

    const companyId = String((enrolled as any).company?.id ?? '');
    const enrollmentId = String((enrolled as any).enrollment?.id ?? '');
    if (!companyId || !enrollmentId) throw new Error('Pilot enrollment did not return company/enrollment identifiers');

    const {rows} = await this.db.query<PilotApplicationRow>(
      `UPDATE commercial_pilot_applications
          SET status='accepted', tax_id=COALESCE(tax_id,$2), company_id=$3, enrollment_id=$4,
              pilot_environment='test', converted_at=COALESCE(converted_at,now()), updated_at=now()
        WHERE id=$1
        RETURNING id,status,contact_name,email,phone,company_name,tax_id,profile,message,source,internal_note,
                  company_id,enrollment_id,pilot_environment,converted_at,created_at,updated_at`,
      [id,taxId,companyId,enrollmentId],
    );
    const updated = rows[0];
    if (!updated) throw new NotFoundException('Commercial pilot application disappeared during conversion');

    return {
      ...this.conversionResponse(updated, false),
      onboarding: {
        pilot_status: (enrolled as any).pilot_status ?? null,
        route: (enrolled as any).route ?? null,
        blockers: (enrolled as any).blockers ?? [],
        checklist: (enrolled as any).checklist ?? [],
        next_actions: (enrolled as any).next_actions ?? [],
        links: (enrolled as any).links ?? null,
      },
    };
  }

  private async getApplication(id:string):Promise<PilotApplicationRow> {
    const {rows} = await this.db.query<PilotApplicationRow>(
      `SELECT id,status,contact_name,email,phone,company_name,tax_id,profile,message,source,internal_note,
              company_id,enrollment_id,pilot_environment,converted_at,created_at,updated_at
         FROM commercial_pilot_applications WHERE id=$1 LIMIT 1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Commercial pilot application not found');
    return rows[0];
  }

  private conversionResponse(app:PilotApplicationRow,idempotent:boolean) {
    return {
      application_id:app.id,
      status:app.status,
      company_id:app.company_id,
      enrollment_id:app.enrollment_id,
      environment:app.pilot_environment,
      converted_at:app.converted_at,
      idempotent,
      safeguards:{
        fiscal_transmission_attempted:false,
        fiscal_emission_attempted:false,
        live_enabled_by_conversion:false,
      },
    };
  }

  private publicResponse(id:string,createdAt:Date|string,deduplicated:boolean) {
    return {
      application_id:id,
      status:'received',
      deduplicated,
      created_at:createdAt,
      next_step:'A equipe TaxAgent revisará o perfil antes de liberar o onboarding do piloto.',
      fiscal_transmission_attempted:false,
    };
  }
}

function clean(value?:string|null): string|null { const text=String(value??'').trim(); return text || null; }
