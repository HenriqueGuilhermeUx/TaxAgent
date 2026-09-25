import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

@Injectable()
export class DpsSequenceService {
  constructor(private readonly db: DatabaseService) {}

  async next(companyId: string, environment: FiscalEnvironment): Promise<number> {
    const { rows } = await this.db.query<{ value: string }>(
      `INSERT INTO dps_sequences(company_id, environment, next_number)
       VALUES ($1,$2,2)
       ON CONFLICT(company_id, environment)
       DO UPDATE SET next_number=dps_sequences.next_number+1
       RETURNING (next_number-1)::text AS value`,
      [companyId, environment],
    );
    return Number(rows[0].value);
  }
}
