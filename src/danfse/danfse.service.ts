import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { FiscalDocumentsService } from '../documents/fiscal-documents.service';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { OfficialRtcClient, officialRtcMode } from '../official-rtc/official-rtc.client';
import { DanfseParserService } from './danfse-parser.service';
import { DanfseRendererService } from './danfse-renderer.service';

@Injectable()
export class DanfseService {
  constructor(private readonly db: DatabaseService, private readonly documents: FiscalDocumentsService, private readonly parser: DanfseParserService, private readonly renderer: DanfseRendererService, private readonly officialRtc: OfficialRtcClient) {}

  async generate(invoiceId: string, companyId?: string) {
    const { rows } = await this.db.query<{ company_id: string; status: string; environment: string }>('SELECT company_id, status, environment FROM invoices WHERE id=$1', [invoiceId]);
    const invoice = rows[0];
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (companyId && invoice.company_id !== companyId) throw new ForbiddenException('Invoice belongs to another company');
    if (invoice.environment === 'production' && process.env.TAXAGENT_DANFSE_RENDERER_MODE !== 'verified') throw new FiscalEngineError('TA_DANFSE_RENDERER_UNVERIFIED', 'Production DANFSe rendering is blocked until the NT008 v1.02 renderer and official resources are marked verified', false);

    const source = await this.documents.latestContent(invoiceId, 'nfse-authorized-xml');
    if (!source) throw new NotFoundException('Authorized NFS-e XML not found for invoice');
    const model = this.parser.parse(source.content.toString('utf8'));
    // Shadow evidence is non-authoritative: never persist the upstream PDF or its raw error.
    const shadowEvidence: { mode: 'shadow'; status: 'success' | 'failure'; official_pdf_sha256?: string; official_pdf_bytes?: number; byte_comparison?: 'identical' | 'different'; semantic_assessment?: 'not_assessed' } | undefined =
      invoice.environment === 'test' && officialRtcMode() === 'shadow' && this.officialRtc.danfseConfigured()
        ? { mode: 'shadow', status: 'failure' }
        : undefined;
    // Never send production taxpayer XML to an optional shadow sidecar.
    if (shadowEvidence) {
      try {
        const officialPdf = await this.officialRtc.renderDanfse(source.content.toString('utf8'));
        shadowEvidence.status = 'success';
        shadowEvidence.official_pdf_sha256 = createHash('sha256').update(officialPdf).digest('hex');
        shadowEvidence.official_pdf_bytes = officialPdf.length;
      } catch {
        // Optional shadow failure must not interrupt the existing renderer.
      }
    }
    const pdf = await this.renderer.render(model, invoice.status);
    // Byte equality is a diagnostic only: differing PDF metadata can change bytes without changing meaning.
    // Never interpret this result as visual/semantic conformance or renderer promotion eligibility.
    if (shadowEvidence?.status === 'success' && shadowEvidence.official_pdf_sha256) {
      shadowEvidence.byte_comparison = shadowEvidence.official_pdf_sha256 === createHash('sha256').update(pdf).digest('hex') ? 'identical' : 'different';
      // Byte equality cannot establish semantic/visual equivalence; explicit fail-closed gate.
      shadowEvidence.semantic_assessment = 'not_assessed';
    }
    return this.documents.save({ invoiceId, kind: 'danfse-pdf', content: pdf, contentType: 'application/pdf', metadata: { specification: model.specVersion, compliance_mode: process.env.TAXAGENT_DANFSE_RENDERER_MODE ?? 'draft', source_sha256: source.sha256, ...(shadowEvidence ? { official_shadow: { ...shadowEvidence, local_pdf_sha256: createHash('sha256').update(pdf).digest('hex'), local_pdf_bytes: pdf.length } } : {}) } });
  }
}
