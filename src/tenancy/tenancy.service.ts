import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class TenancyService {
  constructor(private readonly db: DatabaseService) {}

  async createOrganization(name: string) {
    const id = createId('org');
    const { rows } = await this.db.query(
      'INSERT INTO organizations(id, name) VALUES ($1, $2) RETURNING id, name, created_at',
      [id, name],
    );
    return rows[0];
  }

  async createCompany(organizationId: string, dto: CreateCompanyDto) {
    const organization = await this.db.query('SELECT id FROM organizations WHERE id = $1', [organizationId]);
    if (!organization.rowCount) throw new NotFoundException('Organization not found');

    const id = createId('comp');
    try {
      const { rows } = await this.db.query(
        `INSERT INTO companies(id, organization_id, name, tax_id, municipal_registration, city_code, tax_regime)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, organization_id, name, tax_id, municipal_registration, city_code, tax_regime, created_at`,
        [id, organizationId, dto.name, dto.tax_id, dto.municipal_registration ?? null, dto.city_code, dto.tax_regime ?? null],
      );
      return rows[0];
    } catch (error) {
      if (error instanceof Error && error.message.includes('companies_tax_id_key')) {
        throw new ConflictException('Company tax_id already exists');
      }
      throw error;
    }
  }

  async updateCompany(id: string, dto: UpdateCompanyDto) {
    const { rows } = await this.db.query(
      `UPDATE companies
       SET name=COALESCE($2,name),
           city_code=COALESCE($3,city_code),
           municipal_registration=COALESCE($4,municipal_registration),
           tax_regime=COALESCE($5,tax_regime),
           updated_at=NOW()
       WHERE id=$1
       RETURNING id, organization_id, name, tax_id, municipal_registration, city_code, tax_regime, created_at, updated_at`,
      [id, dto.name ?? null, dto.city_code ?? null, dto.municipal_registration ?? null, dto.tax_regime ?? null],
    );
    if (!rows[0]) throw new NotFoundException('Company not found');
    return rows[0];
  }

  async getCompany(id: string) {
    const { rows } = await this.db.query(
      'SELECT id, organization_id, name, tax_id, municipal_registration, city_code, tax_regime, created_at, updated_at FROM companies WHERE id = $1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Company not found');
    return rows[0];
  }
}
