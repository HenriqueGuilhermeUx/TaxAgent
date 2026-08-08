import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { MunicipalParametersClient } from './municipal-parameters.client';

@Injectable()
export class NationalCoverageService {
  constructor(private readonly db: DatabaseService, private readonly client: MunicipalParametersClient) {}

  async supports(cityCode: string, environment: FiscalEnvironment): Promise<boolean> {
    if ((process.env.TAXAGENT_ROUTING_MODE ?? 'assume-national') !== 'verify-national') return true;
    const cached = await this.db.query<{ supported: boolean }>(
      `SELECT supported FROM municipality_capabilities
       WHERE city_code=$1 AND environment=$2 AND provider='nfse-national' AND expires_at > NOW()`,
      [cityCode, environment],
    );
    if (cached.rows[0]) return cached.rows[0].supported;

    const check = await this.client.getConvention(environment, cityCode);
    await this.db.query(
      `INSERT INTO municipality_capabilities(city_code, environment, provider, supported, payload, checked_at, expires_at)
       VALUES ($1,$2,'nfse-national',$3,$4::jsonb,NOW(),NOW()+INTERVAL '24 hours')
       ON CONFLICT(city_code, environment, provider)
       DO UPDATE SET supported=EXCLUDED.supported, payload=EXCLUDED.payload, checked_at=NOW(), expires_at=EXCLUDED.expires_at`,
      [cityCode, environment, check.supported, JSON.stringify(check.payload ?? null)],
    );
    return check.supported;
  }
}
