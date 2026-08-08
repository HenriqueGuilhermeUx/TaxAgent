import { Injectable } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';

export interface JobRecord<T = unknown> {
  id: string;
  type: string;
  payload: T;
  attempts: number;
}

@Injectable()
export class JobsService {
  constructor(private readonly db: DatabaseService) {}

  async enqueue(type: string, payload: unknown, availableAt = new Date()): Promise<string> {
    const id = createId('job');
    await this.db.query(
      'INSERT INTO jobs(id, type, payload, available_at) VALUES ($1,$2,$3::jsonb,$4)',
      [id, type, JSON.stringify(payload), availableAt],
    );
    return id;
  }

  async claim<T = unknown>(type: string): Promise<JobRecord<T> | null> {
    const { rows } = await this.db.query<JobRecord<T>>(
      `UPDATE jobs SET status='processing', attempts=attempts+1, locked_at=NOW(), updated_at=NOW()
       WHERE id = (
         SELECT id FROM jobs
         WHERE type=$1 AND status='queued' AND available_at <= NOW()
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, type, payload, attempts`,
      [type],
    );
    return rows[0] ?? null;
  }

  async complete(id: string): Promise<void> {
    await this.db.query("UPDATE jobs SET status='done', updated_at=NOW() WHERE id=$1", [id]);
  }

  async retryOrFail(id: string, attempts: number, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    if (attempts >= 5) {
      await this.db.query("UPDATE jobs SET status='failed', last_error=$2, updated_at=NOW() WHERE id=$1", [id, message]);
      return;
    }
    const delaySeconds = Math.min(300, 2 ** attempts * 5);
    await this.db.query(
      "UPDATE jobs SET status='queued', available_at=NOW()+($2 || ' seconds')::interval, last_error=$3, updated_at=NOW() WHERE id=$1",
      [id, String(delaySeconds), message],
    );
  }
}
