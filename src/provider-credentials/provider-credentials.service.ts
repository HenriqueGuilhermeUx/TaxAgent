import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { EncryptedEnvelope, EnvelopeCryptoService } from '../security/envelope-crypto.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

interface CredentialRow {
  id: string;
  company_id: string;
  provider: string;
  environment: FiscalEnvironment;
  encrypted_credentials: EncryptedEnvelope;
  credential_keys: string[];
  status: 'pending' | 'verified' | 'disabled';
  verification_metadata?: Record<string, unknown> | null;
  verified_at?: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class ProviderCredentialsService {
  constructor(private readonly db: DatabaseService, private readonly crypto: EnvelopeCryptoService) {}

  async store(
    companyId: string,
    providerInput: string,
    environment: FiscalEnvironment,
    credentialsInput: Record<string, string>,
    note?: string,
  ) {
    await this.assertCompany(companyId);
    const provider = normalizeProvider(providerInput);
    const credentials = normalizeCredentials(credentialsInput);
    const keys = Object.keys(credentials).sort();
    const encrypted = this.crypto.sealText(JSON.stringify(credentials));
    const id = createId('pcred');
    const metadata = note?.trim() ? { onboarding_note: note.trim() } : {};

    const { rows } = await this.db.query<CredentialRow>(
      `INSERT INTO fiscal_provider_credentials(
        id, company_id, provider, environment, encrypted_credentials, credential_keys,
        status, verification_metadata, verified_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,'pending',$7::jsonb,NULL)
      ON CONFLICT(company_id, provider, environment) DO UPDATE SET
        encrypted_credentials=EXCLUDED.encrypted_credentials,
        credential_keys=EXCLUDED.credential_keys,
        status='pending',
        verification_metadata=EXCLUDED.verification_metadata,
        verified_at=NULL,
        updated_at=NOW()
      RETURNING *`,
      [id, companyId, provider, environment, JSON.stringify(encrypted), JSON.stringify(keys), JSON.stringify(metadata)],
    );
    return publicMetadata(rows[0]);
  }

  async list(companyId: string) {
    await this.assertCompany(companyId);
    const { rows } = await this.db.query<CredentialRow>(
      `SELECT id, company_id, provider, environment, credential_keys, status,
              verification_metadata, verified_at, created_at, updated_at
       FROM fiscal_provider_credentials
       WHERE company_id=$1
       ORDER BY provider, environment`,
      [companyId],
    );
    return rows.map(publicMetadata);
  }

  async disable(companyId: string, providerInput: string, environment: FiscalEnvironment) {
    const provider = normalizeProvider(providerInput);
    const { rows } = await this.db.query<CredentialRow>(
      `UPDATE fiscal_provider_credentials
       SET status='disabled', verified_at=NULL, updated_at=NOW()
       WHERE company_id=$1 AND provider=$2 AND environment=$3
       RETURNING id, company_id, provider, environment, credential_keys, status,
                 verification_metadata, verified_at, created_at, updated_at`,
      [companyId, provider, environment],
    );
    if (!rows[0]) throw new NotFoundException('Provider credentials not found');
    return publicMetadata(rows[0]);
  }

  async getVerifiedCredentials(companyId: string, providerInput: string, environment: FiscalEnvironment): Promise<Record<string, string>> {
    const provider = normalizeProvider(providerInput);
    const { rows } = await this.db.query<CredentialRow>(
      `SELECT * FROM fiscal_provider_credentials
       WHERE company_id=$1 AND provider=$2 AND environment=$3 AND status='verified'
       LIMIT 1`,
      [companyId, provider, environment],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException(`Verified ${provider} credentials not found for company`);
    const decoded = JSON.parse(this.crypto.openText(row.encrypted_credentials)) as unknown;
    return normalizeCredentials(decoded as Record<string, string>);
  }

  async markVerified(
    companyId: string,
    providerInput: string,
    environment: FiscalEnvironment,
    verificationMetadata: Record<string, unknown> = {},
  ) {
    const provider = normalizeProvider(providerInput);
    const { rows } = await this.db.query<CredentialRow>(
      `UPDATE fiscal_provider_credentials
       SET status='verified', verified_at=NOW(), verification_metadata=$4::jsonb, updated_at=NOW()
       WHERE company_id=$1 AND provider=$2 AND environment=$3 AND status='pending'
       RETURNING id, company_id, provider, environment, credential_keys, status,
                 verification_metadata, verified_at, created_at, updated_at`,
      [companyId, provider, environment, JSON.stringify(verificationMetadata)],
    );
    if (!rows[0]) throw new NotFoundException('Pending provider credentials not found');
    return publicMetadata(rows[0]);
  }

  private async assertCompany(companyId: string) {
    const result = await this.db.query<{ id: string }>('SELECT id FROM companies WHERE id=$1', [companyId]);
    if (!result.rowCount) throw new NotFoundException('Company not found');
  }
}

function normalizeProvider(value: string): string {
  const provider = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(provider)) throw new BadRequestException('Invalid fiscal provider identifier');
  return provider;
}

function normalizeCredentials(input: Record<string, string>): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Credentials must be an object');
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(key)) throw new BadRequestException(`Invalid credential key: ${rawKey}`);
    if (typeof rawValue !== 'string') throw new BadRequestException(`Credential ${key} must be a string`);
    const value = rawValue.trim();
    if (!value) throw new BadRequestException(`Credential ${key} cannot be empty`);
    if (value.length > 8192) throw new BadRequestException(`Credential ${key} is too large`);
    output[key] = value;
  }
  if (!Object.keys(output).length) throw new BadRequestException('At least one provider credential is required');
  if (Object.keys(output).length > 20) throw new BadRequestException('Too many provider credential fields');
  return output;
}

function publicMetadata(row: CredentialRow | undefined) {
  if (!row) throw new Error('Credential persistence failed');
  return {
    id: row.id,
    company_id: row.company_id,
    provider: row.provider,
    environment: row.environment,
    credential_keys: Array.isArray(row.credential_keys) ? row.credential_keys : [],
    status: row.status,
    verification_metadata: row.verification_metadata ?? {},
    verified_at: row.verified_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    secrets_exposed: false,
  };
}
