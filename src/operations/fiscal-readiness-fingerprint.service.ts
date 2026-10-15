import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

export interface FiscalReadinessFingerprintState {
  company: {
    id: string;
    tax_id: string;
    city_code: string;
    municipal_registration: string | null;
    tax_regime: string | null;
  };
  environment: FiscalEnvironment;
  route: string | null;
  provider: string | null;
  certificate: {
    id: string;
    status: string;
    certificate_fingerprint: string;
    serial_number: string | null;
    subject_tax_id: string | null;
    valid_to: Date | string | null;
  } | null;
  provider_credentials: {
    id: string;
    provider: string;
    environment: FiscalEnvironment;
    credential_keys: unknown;
    status: string;
    verified_at: Date | string | null;
    updated_at: Date | string | null;
  } | null;
}

@Injectable()
export class FiscalReadinessFingerprintService {
  constructor(private readonly db: DatabaseService) {}

  async compute(
    companyId: string,
    environment: FiscalEnvironment,
    route: string | null,
    provider: string | null,
  ): Promise<string> {
    const companyResult = await this.db.query<{
      id: string;
      tax_id: string;
      city_code: string;
      municipal_registration: string | null;
      tax_regime: string | null;
    }>(
      'SELECT id, tax_id, city_code, municipal_registration, tax_regime FROM companies WHERE id=$1 LIMIT 1',
      [companyId],
    );
    const company = companyResult.rows[0];
    if (!company) throw new NotFoundException('Company not found');

    const certificateResult = await this.db.query<{
      id: string;
      status: string;
      certificate_fingerprint: string;
      serial_number: string | null;
      subject_tax_id: string | null;
      valid_to: Date | string | null;
    }>(
      `SELECT id, status, certificate_fingerprint, serial_number, subject_tax_id, valid_to
         FROM certificates
        WHERE company_id=$1 AND status='active'
        ORDER BY created_at DESC
        LIMIT 1`,
      [companyId],
    );

    let providerCredentials: FiscalReadinessFingerprintState['provider_credentials'] = null;
    if (provider) {
      const credentialResult = await this.db.query<{
        id: string;
        provider: string;
        environment: FiscalEnvironment;
        credential_keys: unknown;
        status: string;
        verified_at: Date | string | null;
        updated_at: Date | string | null;
      }>(
        `SELECT id, provider, environment, credential_keys, status, verified_at, updated_at
           FROM fiscal_provider_credentials
          WHERE company_id=$1 AND environment=$2 AND provider=$3
          ORDER BY updated_at DESC
          LIMIT 1`,
        [companyId, environment, provider],
      );
      providerCredentials = credentialResult.rows[0] ?? null;
    }

    return readinessFingerprintSha256({
      company,
      environment,
      route,
      provider,
      certificate: certificateResult.rows[0] ?? null,
      provider_credentials: providerCredentials,
    });
  }
}

export function readinessFingerprintSha256(state: FiscalReadinessFingerprintState): string {
  const payload = {
    version: 'taxagent-readiness-v1',
    company: {
      id: String(state.company.id),
      tax_id: normalizeText(state.company.tax_id),
      city_code: normalizeText(state.company.city_code),
      municipal_registration_sha256: hashOptional(state.company.municipal_registration),
      tax_regime: normalizeNullable(state.company.tax_regime),
    },
    environment: state.environment,
    route: normalizeNullable(state.route),
    provider: normalizeNullable(state.provider),
    certificate: state.certificate ? {
      id: String(state.certificate.id),
      status: String(state.certificate.status),
      certificate_fingerprint: normalizeText(state.certificate.certificate_fingerprint),
      serial_number: normalizeNullable(state.certificate.serial_number),
      subject_tax_id: normalizeNullable(state.certificate.subject_tax_id),
      valid_to: normalizeDate(state.certificate.valid_to),
    } : null,
    provider_credentials: state.provider_credentials ? {
      id: String(state.provider_credentials.id),
      provider: normalizeText(state.provider_credentials.provider),
      environment: state.provider_credentials.environment,
      credential_keys: normalizeCredentialKeys(state.provider_credentials.credential_keys),
      status: String(state.provider_credentials.status),
      verified_at: normalizeDate(state.provider_credentials.verified_at),
      updated_at: normalizeDate(state.provider_credentials.updated_at),
    } : null,
  };
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}

function normalizeCredentialKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((item) => item.trim()).filter(Boolean).sort();
}

function normalizeDate(value: Date | string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : String(value);
}

function normalizeText(value: string): string {
  return String(value ?? '').trim();
}

function normalizeNullable(value: string | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function hashOptional(value: string | null): string | null {
  const normalized = normalizeNullable(value);
  return normalized ? createHash('sha256').update(normalized, 'utf8').digest('hex') : null;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`).join(',')}}`;
}
