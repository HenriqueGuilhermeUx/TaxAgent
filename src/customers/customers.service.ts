import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';

export type CustomerIssWithholdingDefault = 'not_withheld' | 'customer' | 'intermediary';

export interface CustomerRecord {
  id: string;
  company_id: string;
  tax_id: string;
  normalized_tax_id: string;
  name: string;
  normalized_name: string;
  city_code: string;
  created_at: Date;
  updated_at: Date;
}

interface CustomerInput {
  tax_id: string;
  name: string;
  city_code: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly db: DatabaseService) {}

  async upsertFromOperation(companyId: string, input: CustomerInput): Promise<CustomerRecord> {
    const normalizedTaxId = this.normalizeTaxId(input.tax_id);
    const name = String(input.name ?? '').trim();
    const cityCode = String(input.city_code ?? '').trim();
    if (!normalizedTaxId || normalizedTaxId.length > 32) throw new BadRequestException('Customer tax_id is required');
    if (!name) throw new BadRequestException('Customer name is required');
    if (!/^\d{7}$/.test(cityCode)) throw new BadRequestException('Customer city_code must contain 7 digits');
    const id = createId('cust');
    const { rows } = await this.db.query<CustomerRecord>(
      `INSERT INTO customers(id, company_id, tax_id, normalized_tax_id, name, normalized_name, city_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(company_id, normalized_tax_id)
       DO UPDATE SET tax_id=EXCLUDED.tax_id, name=EXCLUDED.name, normalized_name=EXCLUDED.normalized_name, city_code=EXCLUDED.city_code, updated_at=NOW()
       RETURNING *`,
      [id, companyId, String(input.tax_id).trim(), normalizedTaxId, name, this.normalizeName(name), cityCode],
    );
    return rows[0];
  }

  async get(companyId: string, id: string): Promise<CustomerRecord> {
    const { rows } = await this.db.query<CustomerRecord>('SELECT * FROM customers WHERE id=$1 AND company_id=$2', [id, companyId]);
    if (!rows[0]) throw new NotFoundException('Customer not found');
    return rows[0];
  }

  async list(companyId: string, query?: string) {
    // Self-heal the customer registry from immutable Fiscal Intent snapshots.
    // This is deliberately insert-only on conflict: a newer explicit customer edit
    // must never be overwritten by an older historical Fiscal Intent snapshot.
    await this.syncFromFiscalIntents(companyId);

    const q = String(query ?? '').trim();
    if (!q) {
      const { rows } = await this.db.query<CustomerRecord>(
        'SELECT * FROM customers WHERE company_id=$1 ORDER BY updated_at DESC, name ASC LIMIT 100',
        [companyId],
      );
      return Promise.all(rows.map((row) => this.toPublicWithMemory(row)));
    }
    const normalizedTaxId = this.normalizeTaxId(q);
    const normalizedName = this.normalizeName(q);
    const { rows } = await this.db.query<CustomerRecord>(
      `SELECT * FROM customers
       WHERE company_id=$1
         AND (normalized_name LIKE $2 OR normalized_tax_id LIKE $3)
       ORDER BY updated_at DESC, name ASC LIMIT 100`,
      [companyId, `%${normalizedName}%`, `%${normalizedTaxId}%`],
    );
    return Promise.all(rows.map((row) => this.toPublicWithMemory(row)));
  }

  async getFiscalDefault(companyId: string, customerId: string, serviceProfile: string): Promise<CustomerIssWithholdingDefault | undefined> {
    await this.get(companyId, customerId);
    const { rows } = await this.db.query<{ iss_withholding_default: CustomerIssWithholdingDefault }>(
      `SELECT iss_withholding_default FROM customer_fiscal_memory
       WHERE customer_id=$1 AND service_profile=$2`,
      [customerId, serviceProfile],
    );
    return rows[0]?.iss_withholding_default;
  }

  async rememberFiscalDefault(companyId: string, customerId: string, serviceProfile: string, value: CustomerIssWithholdingDefault) {
    if (!['not_withheld', 'customer', 'intermediary'].includes(value)) throw new BadRequestException('Invalid ISS withholding default');
    const customer = await this.get(companyId, customerId);
    await this.db.query(
      `INSERT INTO customer_fiscal_memory(customer_id, service_profile, iss_withholding_default, source, confirmed_at, updated_at)
       VALUES ($1,$2,$3,'user_confirmed_default',NOW(),NOW())
       ON CONFLICT(customer_id, service_profile)
       DO UPDATE SET iss_withholding_default=EXCLUDED.iss_withholding_default, source='user_confirmed_default', confirmed_at=NOW(), updated_at=NOW()`,
      [customerId, serviceProfile, value],
    );
    return this.toPublicWithMemory(customer);
  }

  async clearFiscalDefault(companyId: string, customerId: string, serviceProfile: string) {
    await this.get(companyId, customerId);
    await this.db.query('DELETE FROM customer_fiscal_memory WHERE customer_id=$1 AND service_profile=$2', [customerId, serviceProfile]);
    return { customer_id: customerId, service_profile: serviceProfile, cleared: true };
  }

  private async syncFromFiscalIntents(companyId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO customers(id, company_id, tax_id, normalized_tax_id, name, normalized_name, city_code)
       SELECT
         'cust_' || substr(md5(fi.company_id || ':' || regexp_replace(upper(fi.request->'customer'->>'tax_id'), '[^A-Z0-9]', '', 'g')), 1, 32),
         fi.company_id,
         fi.request->'customer'->>'tax_id',
         regexp_replace(upper(fi.request->'customer'->>'tax_id'), '[^A-Z0-9]', '', 'g'),
         fi.request->'customer'->>'name',
         lower(trim(fi.request->'customer'->>'name')),
         fi.request->'customer'->>'city_code'
       FROM fiscal_intents fi
       WHERE fi.company_id=$1
         AND jsonb_typeof(fi.request->'customer')='object'
         AND COALESCE(fi.request->'customer'->>'tax_id','') <> ''
         AND COALESCE(fi.request->'customer'->>'name','') <> ''
         AND COALESCE(fi.request->'customer'->>'city_code','') ~ '^\\d{7}$'
       ON CONFLICT(company_id, normalized_tax_id) DO NOTHING`,
      [companyId],
    );
  }

  private async toPublicWithMemory(row: CustomerRecord) {
    const { rows } = await this.db.query<{ service_profile: string; iss_withholding_default: CustomerIssWithholdingDefault; source: string; confirmed_at: Date }>(
      `SELECT service_profile, iss_withholding_default, source, confirmed_at
       FROM customer_fiscal_memory WHERE customer_id=$1 ORDER BY service_profile`,
      [row.id],
    );
    return {
      id: row.id,
      tax_id: row.tax_id,
      name: row.name,
      city_code: row.city_code,
      fiscal_memory: rows.map((memory) => ({
        service_profile: memory.service_profile,
        iss_withholding_default: memory.iss_withholding_default,
        source: memory.source,
        confirmed_at: memory.confirmed_at,
      })),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private normalizeTaxId(value: string): string {
    return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private normalizeName(value: string): string {
    return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
  }
}
