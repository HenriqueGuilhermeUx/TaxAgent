import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const dir = join(process.cwd(), 'migrations');
    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    for (const filename of files) {
      const exists = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
      if (exists.rowCount) continue;
      const sql = await readFile(join(dir, filename), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`applied ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

void main();
