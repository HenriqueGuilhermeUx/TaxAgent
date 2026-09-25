import assert from 'node:assert/strict';
import test from 'node:test';
import { PilotOperationsService, toQueueItem } from '../src/operations/pilot-operations.service';

function row(overrides: Record<string, unknown> = {}) {
  return {
    company_id: 'comp_1',
    organization_id: 'org_1',
    company_name: 'Empresa Piloto',
    tax_id: '12345678000190',
    city_code: '3548500',
    municipal_registration: '123',
    tax_regime: 'regular',
    company_created_at: '2026-09-24T10:00:00Z',
    company_updated_at: '2026-09-24T10:00:00Z',
    onboarding_id: 'onb_1',
    onboarding_status: 'READY_FOR_HOMOLOGATION',
    onboarding_route: 'municipal-provider',
    onboarding_provider: 'giss',
    onboarding_blockers: [],
    onboarding_snapshot: { next_actions: [] },
    onboarding_sha256: 'a'.repeat(64),
    onboarding_created_at: '2026-09-24T11:00:00Z',
    preflight_id: 'pre_1',
    preflight_status: 'PREFLIGHT_OK',
    preflight_route: 'municipal-provider',
    preflight_provider: 'giss',
    preflight_blockers: [],
    preflight_sha256: 'b'.repeat(64),
    preflight_created_at: '2026-09-24T12:00:00Z',
    ...overrides,
  } as any;
}

test('current successful evidence is homologation ready while transmission stays closed', () => {
  const item = toQueueItem(row());
  assert.equal(item.pilot_status, 'HOMOLOGATION_READY');
  assert.deepEqual(item.blockers, []);
  assert.equal(item.transmission.allowed, false);
  assert.equal(item.transmission.fiscal_transmission_attempted, false);
});

test('company changes invalidate the last onboarding assessment', () => {
  const item = toQueueItem(row({ company_updated_at: '2026-09-25T09:00:00Z' }));
  assert.equal(item.pilot_status, 'READY_FOR_ASSESSMENT');
  assert.equal(item.freshness.onboarding, 'STALE');
  assert.ok(item.blockers.includes('company_changed_since_last_assessment'));
});

test('ready onboarding with missing preflight becomes ready for preflight', () => {
  const item = toQueueItem(row({
    preflight_id: null,
    preflight_status: null,
    preflight_route: null,
    preflight_provider: null,
    preflight_created_at: null,
    preflight_sha256: null,
  }));
  assert.equal(item.pilot_status, 'READY_FOR_PREFLIGHT');
  assert.equal(item.next_action.kind, 'RUN_PREFLIGHT');
});

test('blocked onboarding surfaces persisted blockers and snapshot next action', () => {
  const item = toQueueItem(row({
    onboarding_status: 'BLOCKED',
    onboarding_blockers: ['active_a1'],
    onboarding_snapshot: { next_actions: [{ requirement: 'active_a1', action: 'Upload A1' }] },
    preflight_id: null,
    preflight_created_at: null,
  }));
  assert.equal(item.pilot_status, 'ACTION_REQUIRED');
  assert.deepEqual(item.blockers, ['active_a1']);
  assert.equal(item.next_action.requirement, 'active_a1');
});

test('queue reads persisted attestations only and supports status filtering', async () => {
  let sql = '';
  const service = new PilotOperationsService({
    query: async (statement: string) => {
      sql = statement;
      return { rows: [row(), row({ company_id: 'comp_2', company_name: 'Empresa Sem Avaliacao', onboarding_id: null, onboarding_created_at: null, preflight_id: null, preflight_created_at: null })] };
    },
  } as any);

  const result = await service.list({
    environment: 'test',
    status: 'READY_FOR_ASSESSMENT',
    limit: 50,
    offset: 0,
  });

  assert.match(sql, /fiscal_onboarding_attestations/);
  assert.equal(result.safeguards.provider_network_attempted, false);
  assert.equal(result.pagination.filtered_total, 1);
  assert.equal(result.items[0]?.company.id, 'comp_2');
  assert.equal(result.summary.homologation_ready, 1);
  assert.equal(result.summary.ready_for_assessment, 1);
});
