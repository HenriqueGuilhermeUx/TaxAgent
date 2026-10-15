import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { OpenDataResult, RtcOpenDataClient } from './rtc-open-data.client';

@Injectable()
export class TaxDomainRegistryService {
  private readonly registry: unknown;
  constructor(private readonly db: DatabaseService, private readonly rtc: RtcOpenDataClient) {
    this.registry = JSON.parse(readFileSync(join(process.cwd(), 'tax-domains', 'registry.json'), 'utf8'));
  }
  metadata() { return this.registry; }
  async syncRuntimeVersion() {
    const result = await this.rtc.getVersion();
    const serialized = JSON.stringify(result.payload);
    const sha256 = createHash('sha256').update(serialized).digest('hex');
    const version = this.versionLabel(result.payload, sha256);
    const id = createId('tdv');
    await this.db.query(
      `INSERT INTO tax_dataset_versions(id, dataset, version, source_url, sha256, authority, payload)
       VALUES ($1,'rtc-open-data',$2,$3,$4,'runtime-reference',$5::jsonb)
       ON CONFLICT(dataset, version, sha256) DO NOTHING`,
      [id, version, result.url, sha256, serialized],
    );
    return { dataset: 'rtc-open-data', version, sha256, source_url: result.url, fetched_at: result.fetchedAt };
  }
  async cacheRecord(dataset: string, recordKey: string, result: OpenDataResult, ttlHours = 24) {
    const serialized = JSON.stringify(result.payload);
    const sha256 = createHash('sha256').update(serialized).digest('hex');
    await this.db.query(
      `INSERT INTO tax_domain_records(dataset, record_key, source_url, sha256, payload, fetched_at, expires_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,NOW(),NOW()+($6 || ' hours')::interval)
       ON CONFLICT(dataset, record_key) DO UPDATE SET source_url=EXCLUDED.source_url, sha256=EXCLUDED.sha256, payload=EXCLUDED.payload, fetched_at=NOW(), expires_at=EXCLUDED.expires_at`,
      [dataset, recordKey, result.url, sha256, serialized, String(ttlHours)],
    );
    return { dataset, record_key: recordKey, sha256, source_url: result.url };
  }
  private versionLabel(payload: unknown, sha: string): string {
    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      for (const key of ['versao', 'version', 'versaoAplicativo', 'versaoBancoDados']) if (record[key]) return String(record[key]);
    }
    return `sha256-${sha.slice(0, 12)}`;
  }
}
