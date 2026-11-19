import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { validateVisualAttestationInput } from '../src/danfse/danfse-visual-conformance.service';

const doc = {
  id: 'doc_1',
  invoice_id: 'inv_1',
  kind: 'danfse-pdf',
  sha256: 'a'.repeat(64),
  created_at: '2026-11-19T00:00:00Z',
  metadata: {
    official_shadow: {
      status: 'success',
      semantic_assessment: 'matched_fields',
      official_pdf_sha256: 'b'.repeat(64),
      local_pdf_sha256: 'a'.repeat(64),
    },
  },
};

test('visual attestation accepts matched only when semantic gate and every checklist item pass', () => {
  const result = validateVisualAttestationInput({
    document_id: 'doc_1',
    assessment: 'matched',
    layout_consistent: true,
    required_fields_visible: true,
    text_legible: true,
    no_clipping_or_overlap: true,
  }, doc);

  assert.equal(result.localPdfSha256, 'a'.repeat(64));
  assert.equal(result.officialPdfSha256, 'b'.repeat(64));
  assert.equal(result.semanticAssessment, 'matched_fields');
});

test('visual attestation refuses matched when any checklist item is false', () => {
  assert.throws(() => validateVisualAttestationInput({
    document_id: 'doc_1',
    assessment: 'matched',
    layout_consistent: true,
    required_fields_visible: true,
    text_legible: false,
    no_clipping_or_overlap: true,
  }, doc), BadRequestException);
});

test('visual attestation fails closed when semantic evidence is missing or local hash drifted', () => {
  assert.throws(() => validateVisualAttestationInput({
    document_id: 'doc_1',
    assessment: 'inconclusive',
    layout_consistent: false,
    required_fields_visible: false,
    text_legible: false,
    no_clipping_or_overlap: false,
  }, {
    ...doc,
    metadata: { official_shadow: { ...doc.metadata.official_shadow, semantic_assessment: 'inconclusive' } },
  }), BadRequestException);

  assert.throws(() => validateVisualAttestationInput({
    document_id: 'doc_1',
    assessment: 'different',
    layout_consistent: false,
    required_fields_visible: true,
    text_legible: true,
    no_clipping_or_overlap: true,
  }, {
    ...doc,
    metadata: { official_shadow: { ...doc.metadata.official_shadow, local_pdf_sha256: 'c'.repeat(64) } },
  }), BadRequestException);
});
