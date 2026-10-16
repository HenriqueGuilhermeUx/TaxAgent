import assert from 'node:assert/strict';
import test from 'node:test';
import { IssuerReadinessService } from '../src/operations/issuer-readiness.service';

function serviceWithDb(rows: any[], cancellation = { event_count: '0', document_count: '0' }) {
  let queryCount = 0;
  const db = {
    query: async () => {
      queryCount += 1;
      return queryCount === 1 ? { rows, rowCount: rows.length } : { rows: [cancellation], rowCount: 1 };
    },
  } as any;
  const service = new IssuerReadinessService({} as any, {} as any, {} as any, {} as any, db);
  (service as any).inspect = async () => ({
    company_id: 'comp_1',
    environment: 'test',
    eligible_for_national_test_issuance: true,
    blockers: [],
  });
  return service;
}

test('core emission status does not claim issuance without official persisted proof', async () => {
  const service = serviceWithDb([]);
  const status = await service.coreEmissionStatus('comp_1', 'test');
  assert.equal(status.stage, 'ELIGIBLE_NOT_YET_PROVEN');
  assert.equal(status.official_proof.proven_authorized_nfse_count, 0);
  assert.equal(status.official_proof.proven_once, false);
  assert.match(status.truthful_answer, /no persisted official authorization proof/i);
  assert.equal(status.safeguards.fiscal_transmission_attempted_by_this_endpoint, false);
});

test('core emission status recognizes an authorized National NFS-e only when access key and authorized XML hash are both preserved', async () => {
  const service = serviceWithDb([{
    id: 'inv_1',
    provider: 'nfse-national',
    access_key: 'secret-access-key-never-returned',
    updated_at: '2026-10-15T23:00:00Z',
    authorized_xml_sha256: 'a'.repeat(64),
    authorized_xml_created_at: '2026-10-15T23:00:01Z',
  }]);
  const status = await service.coreEmissionStatus('comp_1', 'test');
  assert.equal(status.stage, 'AUTHORIZED_PROOF_EXISTS');
  assert.equal(status.official_proof.proven_authorized_nfse_count, 1);
  assert.equal(status.official_proof.proven_once, true);
  assert.equal(status.official_proof.last_proof?.access_key_present, true);
  assert.equal((status.official_proof.last_proof as any)?.access_key, undefined);
  assert.equal(status.official_proof.last_proof?.authorized_xml_sha256, 'a'.repeat(64));
});

test('core emission status requires repeated proofs plus cancellation evidence for repeatable homologation stage', async () => {
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id: 'inv_' + index,
    provider: 'nfse-national',
    access_key: 'key_' + index,
    updated_at: '2026-10-15T23:00:00Z',
    authorized_xml_sha256: String(index).padStart(64, '0'),
    authorized_xml_created_at: '2026-10-15T23:00:01Z',
  }));
  const service = serviceWithDb(rows, { event_count: '1', document_count: '1' });
  const status = await service.coreEmissionStatus('comp_1', 'test');
  assert.equal(status.stage, 'REPEATABLE_HOMOLOGATION');
  assert.equal(status.official_proof.repeatability_target_met, true);
  assert.equal(status.official_proof.cancellation_event_proven, true);
});
