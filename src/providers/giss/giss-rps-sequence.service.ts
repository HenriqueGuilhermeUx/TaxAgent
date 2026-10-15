import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FiscalEnvironment } from '../../fiscal-core/fiscal.types';

@Injectable()
export class GissRpsSequenceService {
  constructor(private readonly db: DatabaseService) {}

  reserve(companyId: string, environment: FiscalEnvironment, series: string, invoiceId: string): Promise<number> {
    return this.db.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`giss-rps:${companyId}:${environment}:${series}`]);

      const existing = await client.query<{ number: string }>(
        `SELECT number::text AS number FROM giss_rps_assignments
         WHERE company_id=$1 AND environment=$2 AND series=$3 AND invoice_id=$4`,
        [companyId, environment, series, invoiceId],
      );
      if (existing.rows[0]) return Number(existing.rows[0].number);

      const allocated = await client.query<{ value: string }>(
        `INSERT INTO giss_rps_counters(company_id, environment, series, next_number)
         VALUES ($1,$2,$3,2)
         ON CONFLICT(company_id, environment, series)
         DO UPDATE SET next_number=giss_rps_counters.next_number+1
         RETURNING (next_number-1)::text AS value`,
        [companyId, environment, series],
      );
      const number = Number(allocated.rows[0].value);
      await client.query(
        `INSERT INTO giss_rps_assignments(company_id, environment, series, invoice_id, number)
         VALUES ($1,$2,$3,$4,$5)`,
        [companyId, environment, series, invoiceId, number],
      );
      return number;
    });
  }
}
