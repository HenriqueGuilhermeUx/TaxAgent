import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

export type FiscalOnboardingAttestationType = 'onboarding' | 'preflight';

interface AttestationInput {
  environment?: FiscalEnvironment;
  status?: string;
  route?: { resolved_route?: string; resolved_provider?: string } | null;
  blockers?: unknown;
  [key: string]: unknown;
}

interface AttestationRow {
  id: string;
  company_id: string;
  environment: FiscalEnvironment;
  assessment_type: FiscalOnboardingAttestationType;
  status: string;
  route: string | null;
  provider: string | null;
  blockers: unknown;
  snapshot_sha256: string;
  created_at: Date | string;
}

const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  'password', 'senha', 'token', 'api_key', 'apikey', 'private_key', 'privatekey', 'pfx', 'p12',
  'encrypted_pfx', 'encrypted_password', 'credential_value', 'credential_values', 'raw_secret',
]);

@Injectable()
export class FiscalOnboardingAuditService {
  constructor(private readonly db: DatabaseService) {}

  async record(companyId: string, type: FiscalOnboardingAttestationType, result: AttestationInput) {
    this.assertSafe(result);
    const snapshot = JSON.parse(JSON.stringify(result)) as AttestationInput;
    const canonical = canonicalJson(snapshot);
    const sha256 = createHash('sha256').update(canonical, 'utf8').digest('hex');
    const id = createId('onbatt');
    const environment = result.environment === 'production' ? 'production' : 'test';
    const status = String(result.status ?? 'UNKNOWN');
    const route = result.route?.resolved_route ? String(result.route.resolved_route) : null;
    const provider = result.route?.resolved_provider ? String(result.route.resolved_provider) : null;
    const blockers = Array.isArray(result.blockers) ? result.blockers : [];

    const { rows } = await this.db.query<AttestationRow>(
      `INSERT INTO fiscal_onboarding_attestations(
         id, company_id, environment, assessment_type, status, route, provider, blockers, snapshot, snapshot_sha256
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
       RETURNING id, company_id, environment, assessment_type, status, route, provider, blockers, snapshot_sha256, created_at`,
      [id, companyId, environment, type, status, route, provider, JSON.stringify(blockers), JSON.stringify(snapshot), sha256],
    );

    const row = rows[0];
    return {
      id: row?.id ?? id,
      company_id: companyId,
      environment,
      assessment_type: type,
      status,
      route,
      provider,
      blockers,
      snapshot_sha256: sha256,
      created_at: row?.created_at ?? new Date().toISOString(),
      immutable_evidence: true,
      secrets_exposed: false,
    };
  }

  async list(companyId: string, limit = 50) {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const { rows } = await this.db.query<AttestationRow>(
      `SELECT id, company_id, environment, assessment_type, status, route, provider, blockers, snapshot_sha256, created_at
       FROM fiscal_onboarding_attestations
       WHERE company_id=$1
       ORDER BY created_at DESC
       LIMIT $2`,
      [companyId, safeLimit],
    );
    return rows.map((row) => ({ ...row, immutable_evidence: true }));
  }

  private assertSafe(value: unknown, path = 'snapshot'): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => this.assertSafe(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_SNAPSHOT_KEYS.has(key.toLowerCase())) {
        throw new Error(`Refusing to persist secret-bearing onboarding snapshot field: ${path}.${key}`);
      }
      this.assertSafe(nested, `${path}.${key}`);
    }
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const source = value as Record<string, unknown>;
  const keys = Object.keys(source).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(source[key])}`).join(',')}}`;
}
