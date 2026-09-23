import assert from 'node:assert/strict';
import test from 'node:test';
import { GissRpsSequenceService } from '../src/providers/giss/giss-rps-sequence.service';

test('returns an existing RPS assignment without consuming another number', async () => {
  const sql: string[] = [];
  const client = {
    query: async (query: string) => {
      sql.push(query);
      if (query.includes('SELECT number::text')) return { rows: [{ number: '7' }] };
      throw new Error('unexpected allocation query');
    },
  };
  const db = { withTransaction: async (fn: any) => fn(client) };
  const service = new GissRpsSequenceService(db as any);
  assert.equal(await service.reserve('comp_1', 'test', 'TA', 'inv_1'), 7);
  assert.equal(sql.filter((query) => query.includes('giss_rps_counters')).length, 0);
});

test('atomically allocates and persists the first RPS number for an invoice', async () => {
  const calls: Array<{ query: string; params?: unknown[] }> = [];
  const client = {
    query: async (query: string, params?: unknown[]) => {
      calls.push({ query, params });
      if (query.includes('SELECT number::text')) return { rows: [] };
      if (query.includes('INSERT INTO giss_rps_counters')) return { rows: [{ value: '1' }] };
      if (query.includes('INSERT INTO giss_rps_assignments')) return { rows: [] };
      return { rows: [] };
    },
  };
  const db = { withTransaction: async (fn: any) => fn(client) };
  const service = new GissRpsSequenceService(db as any);
  assert.equal(await service.reserve('comp_1', 'test', 'TA', 'inv_1'), 1);
  assert.ok(calls.some((call) => call.query.includes('pg_advisory_xact_lock')));
  assert.ok(calls.some((call) => call.query.includes('INSERT INTO giss_rps_assignments')));
});
