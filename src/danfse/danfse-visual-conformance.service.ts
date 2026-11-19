import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { CreateDanfseVisualAttestationDto } from './dto/create-danfse-visual-attestation.dto';

interface DanfseDocumentRow {
  id: string;
  invoice_id: string;
  kind: string;
  sha256: string;
  metadata: any;
  created_at: string | Date;
}

interface InvoiceRow {
  id: string;
  company_id: string;
  environment: 'test' | 'production';
}

function visualChecklist(dto: CreateDanfseVisualAttestationDto) {
  return {
    layout_consistent: dto.layout_consistent,
    required_fields_visible: dto.required_fields_visible,
    text_legible: dto.text_legible,
    no_clipping_or_overlap: dto.no_clipping_or_overlap,
  };
}

export function validateVisualAttestationInput(
  dto: CreateDanfseVisualAttestationDto,
  document: DanfseDocumentRow,
): { localPdfSha256: string; officialPdfSha256: string; semanticAssessment: string; checklist: ReturnType<typeof visualChecklist> } {
  if (document.kind !== 'danfse-pdf') throw new BadRequestException('Visual conformance can only attest a DANFSe PDF document');
  const shadow = document.metadata?.official_shadow;
  if (!shadow || shadow.status !== 'success') throw new BadRequestException('DANFSe document has no successful official shadow evidence');
  if (shadow.semantic_assessment !== 'matched_fields') {
    throw new BadRequestException('Visual conformance requires semantic shadow assessment matched_fields first');
  }
  if (typeof shadow.official_pdf_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(shadow.official_pdf_sha256)) {
    throw new BadRequestException('Official DANFSe shadow hash is missing');
  }
  if (typeof shadow.local_pdf_sha256 !== 'string' || shadow.local_pdf_sha256 !== document.sha256) {
    throw new BadRequestException('Local DANFSe shadow hash does not match persisted document');
  }

  const checklist = visualChecklist(dto);
  const allMatched = Object.values(checklist).every(Boolean);
  if (dto.assessment === 'matched' && !allMatched) {
    throw new BadRequestException('assessment=matched requires every visual checklist item to be true');
  }

  return {
    localPdfSha256: document.sha256,
    officialPdfSha256: shadow.official_pdf_sha256,
    semanticAssessment: shadow.semantic_assessment,
    checklist,
  };
}

@Injectable()
export class DanfseVisualConformanceService {
  constructor(private readonly db: DatabaseService) {}

  async attest(
    invoiceId: string,
    companyId: string,
    reviewerKeyId: string,
    dto: CreateDanfseVisualAttestationDto,
  ) {
    const invoice = await this.invoice(invoiceId, companyId);
    if (invoice.environment !== 'test') {
      throw new ForbiddenException('Manual DANFSe visual conformance attestations are TEST-only');
    }

    const document = await this.document(invoiceId, dto.document_id);
    const validated = validateVisualAttestationInput(dto, document);
    const id = createId('danvis');

    await this.db.query(
      `INSERT INTO danfse_visual_conformance_attestations(
        id, invoice_id, company_id, document_id, reviewer_key_id, assessment,
        local_pdf_sha256, official_pdf_sha256, semantic_assessment, checklist, note_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [
        id,
        invoiceId,
        companyId,
        dto.document_id,
        reviewerKeyId,
        dto.assessment,
        validated.localPdfSha256,
        validated.officialPdfSha256,
        validated.semanticAssessment,
        JSON.stringify(validated.checklist),
        dto.note_code ?? null,
      ],
    );

    return {
      id,
      invoice_id: invoiceId,
      document_id: dto.document_id,
      assessment: dto.assessment,
      semantic_assessment: validated.semanticAssessment,
      checklist: validated.checklist,
      local_pdf_sha256: validated.localPdfSha256,
      official_pdf_sha256: validated.officialPdfSha256,
      authoritative: false,
      renderer_promoted: false,
      policy: {
        test_only: true,
        append_only: true,
        no_raw_pdf_xml_text_persisted: true,
        manual_visual_attestation_does_not_promote_renderer: true,
      },
    };
  }

  async status(invoiceId: string, companyId: string) {
    const invoice = await this.invoice(invoiceId, companyId);
    const latestDocument = await this.latestDanfse(invoiceId);
    if (!latestDocument) {
      return {
        invoice_id: invoiceId,
        environment: invoice.environment,
        ready_for_manual_visual_review: false,
        reason: 'danfse_pdf_missing',
        latest_attestation: null,
        renderer_promoted: false,
      };
    }

    const shadow = latestDocument.metadata?.official_shadow;
    const ready =
      invoice.environment === 'test'
      && shadow?.status === 'success'
      && shadow?.semantic_assessment === 'matched_fields'
      && shadow?.local_pdf_sha256 === latestDocument.sha256
      && typeof shadow?.official_pdf_sha256 === 'string';

    const { rows } = await this.db.query<any>(
      `SELECT id, document_id, assessment, local_pdf_sha256, official_pdf_sha256,
              semantic_assessment, checklist, note_code, created_at
         FROM danfse_visual_conformance_attestations
        WHERE invoice_id=$1 AND document_id=$2
        ORDER BY created_at DESC LIMIT 1`,
      [invoiceId, latestDocument.id],
    );

    return {
      invoice_id: invoiceId,
      environment: invoice.environment,
      latest_document_id: latestDocument.id,
      latest_document_sha256: latestDocument.sha256,
      ready_for_manual_visual_review: ready,
      semantic_assessment: shadow?.semantic_assessment ?? 'not_assessed',
      latest_attestation: rows[0] ?? null,
      renderer_promoted: false,
      authoritative: false,
    };
  }

  private async invoice(invoiceId: string, companyId: string): Promise<InvoiceRow> {
    const { rows } = await this.db.query<InvoiceRow>(
      'SELECT id, company_id, environment FROM invoices WHERE id=$1',
      [invoiceId],
    );
    const invoice = rows[0];
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.company_id !== companyId) throw new ForbiddenException('Invoice belongs to another company');
    return invoice;
  }

  private async document(invoiceId: string, documentId: string): Promise<DanfseDocumentRow> {
    const { rows } = await this.db.query<DanfseDocumentRow>(
      `SELECT id, invoice_id, kind, sha256, metadata, created_at
         FROM fiscal_documents WHERE id=$1 AND invoice_id=$2`,
      [documentId, invoiceId],
    );
    if (!rows[0]) throw new NotFoundException('DANFSe document not found');
    return rows[0];
  }

  private async latestDanfse(invoiceId: string): Promise<DanfseDocumentRow | null> {
    const { rows } = await this.db.query<DanfseDocumentRow>(
      `SELECT id, invoice_id, kind, sha256, metadata, created_at
         FROM fiscal_documents
        WHERE invoice_id=$1 AND kind='danfse-pdf'
        ORDER BY created_at DESC LIMIT 1`,
      [invoiceId],
    );
    return rows[0] ?? null;
  }
}
