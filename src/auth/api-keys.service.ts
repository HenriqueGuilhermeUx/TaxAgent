import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { TaxAgentAuthContext } from './auth.types';

@Injectable()
export class ApiKeysService {
  constructor(private readonly db: DatabaseService) {}

  async create(companyId: string, name: string, environment: 'test' | 'production', scopes: string[] = ['*']) {
    const company = await this.db.query('SELECT id FROM companies WHERE id=$1', [companyId]);
    if (!company.rowCount) throw new NotFoundException('Company not found');

    const id = createId('key');
    const prefix = environment === 'production' ? 'ta_live' : 'ta_test';
    const secret = `${prefix}_${randomBytes(32).toString('base64url')}`;
    const hash = this.hash(secret);
    await this.db.query(
      `INSERT INTO api_keys(id, company_id, name, environment, key_prefix, secret_hash, scopes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, companyId, name, environment, secret.slice(0, 16), hash, scopes.length ? scopes : ['*']],
    );
    return { id, company_id: companyId, name, environment, key: secret, scopes: scopes.length ? scopes : ['*'], created_at: new Date().toISOString() };
  }

  async authenticate(secret: string): Promise<TaxAgentAuthContext | null> {
    const { rows } = await this.db.query<{
      id: string;
      company_id: string;
      environment: 'test' | 'production';
      scopes: string[];
    }>(
      'SELECT id, company_id, environment, scopes FROM api_keys WHERE secret_hash=$1 AND revoked_at IS NULL LIMIT 1',
      [this.hash(secret)],
    );
    const key = rows[0];
    if (!key) return null;
    void this.db.query('UPDATE api_keys SET last_used_at=NOW() WHERE id=$1', [key.id]);
    return { keyId: key.id, companyId: key.company_id, environment: key.environment, scopes: key.scopes };
  }

  async revoke(companyId: string, keyId: string): Promise<void> {
    const result = await this.db.query('UPDATE api_keys SET revoked_at=NOW() WHERE id=$1 AND company_id=$2 AND revoked_at IS NULL', [keyId, companyId]);
    if (!result.rowCount) throw new NotFoundException('API key not found');
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }
}
