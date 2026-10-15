import { Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { CreatePilotApplicationDto, UpdatePilotApplicationStatusDto } from './dto/commercial-pilot.dto';

@Injectable()
export class CommercialPilotService {
  constructor(private readonly db: DatabaseService) {}

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
    const {rows} = await this.db.query(
      `SELECT id,status,contact_name,email,phone,company_name,tax_id,profile,message,source,internal_note,created_at,updated_at
       FROM commercial_pilot_applications
       WHERE ($1::text IS NULL OR status=$1)
       ORDER BY created_at DESC LIMIT $2`,
      [status ?? null,safeLimit],
    );
    return {items:rows,count:rows.length};
  }

  async update(id:string,input:UpdatePilotApplicationStatusDto) {
    const {rows} = await this.db.query(
      `UPDATE commercial_pilot_applications SET status=$2,internal_note=$3,updated_at=now()
       WHERE id=$1
       RETURNING id,status,contact_name,email,phone,company_name,tax_id,profile,message,source,internal_note,created_at,updated_at`,
      [id,input.status,clean(input.note)],
    );
    return rows[0] ?? null;
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

function clean(value?:string): string|null { const text=String(value??'').trim(); return text || null; }