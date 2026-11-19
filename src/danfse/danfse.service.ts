import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { FiscalDocumentsService } from '../documents/fiscal-documents.service';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { OfficialRtcClient, officialRtcMode } from '../official-rtc/official-rtc.client';
import { extractOfficialDanfseTextFields } from './danfse-official-text-extractor';
import { DanfseParserService } from './danfse-parser.service';
import {
  DANFSE_PDF_TEXT_ADAPTER_VERSION,
  DanfsePdfTextError,
  extractDanfsePdfText,
} from './danfse-pdf-text-adapter';
import {
  DanfseSemanticAssessment,
  DanfseSemanticState,
  assessDanfseSemanticFields,
} from './danfse-semantic-comparator';
import { DanfseModel } from './danfse.types';
import { DanfseRendererService } from './danfse-renderer.service';

interface SemanticPdfSummary {
  state: DanfseSemanticState;
  checked_field_count: number;
  findings: Array<{ field: string; code: string }>;
  extraction_version?: string;
  pdf_adapter_version: string;
  pages?: number;
  error_code?: string;
  visual_conformance: 'not_assessed';
  authoritative: false;
}

interface ShadowEvidence {
  mode: 'shadow';
  status: 'success' | 'failure';
  official_pdf_sha256?: string;
  official_pdf_bytes?: number;
  byte_comparison?: 'identical' | 'different';
  semantic_assessment?: 'not_assessed' | DanfseSemanticState;
  semantic?: {
    official: SemanticPdfSummary;
    local: SemanticPdfSummary;
  };
}

function semanticShadowEnabled(): boolean {
  return process.env.TAXAGENT_DANFSE_SEMANTIC_SHADOW_ENABLED === 'true';
}

function summarizeAssessment(
  assessment: DanfseSemanticAssessment,
  pages: number,
): SemanticPdfSummary {
  return {
    state: assessment.state,
    checked_field_count: assessment.checked_fields.length,
    findings: assessment.findings.map((finding) => ({ field: finding.field, code: finding.code })),
    extraction_version: assessment.extraction_version,
    pdf_adapter_version: DANFSE_PDF_TEXT_ADAPTER_VERSION,
    pages,
    visual_conformance: 'not_assessed',
    authoritative: false,
  };
}

function failedSemanticSummary(error: unknown): SemanticPdfSummary {
  return {
    state: 'inconclusive',
    checked_field_count: 0,
    findings: [],
    pdf_adapter_version: DANFSE_PDF_TEXT_ADAPTER_VERSION,
    error_code: error instanceof DanfsePdfTextError ? error.code : 'parse_failed',
    visual_conformance: 'not_assessed',
    authoritative: false,
  };
}

async function assessPdfAgainstXmlModel(pdf: Buffer, model: DanfseModel): Promise<SemanticPdfSummary> {
  try {
    const extractedText = await extractDanfsePdfText(pdf);
    const boundedFields = extractOfficialDanfseTextFields(extractedText.text);
    const assessment = assessDanfseSemanticFields(model, boundedFields);
    return summarizeAssessment(assessment, extractedText.pages);
  } catch (error) {
    return failedSemanticSummary(error);
  }
}

function aggregateSemantic(
  official: SemanticPdfSummary,
  local: SemanticPdfSummary,
): DanfseSemanticState {
  if (official.state === 'different' || local.state === 'different') return 'different';
  if (official.state === 'matched_fields' && local.state === 'matched_fields') return 'matched_fields';
  return 'inconclusive';
}

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

    // Shadow evidence is non-authoritative: never persist the upstream PDF, raw
    // extracted text, raw XML, taxpayer values or upstream parser error bodies.
    const shadowEvidence: ShadowEvidence | undefined =
      invoice.environment === 'test' && officialRtcMode() === 'shadow' && this.officialRtc.danfseConfigured()
        ? { mode: 'shadow', status: 'failure' }
        : undefined;

    // Keep the official PDF only in memory long enough for fingerprints and the
    // optional semantic shadow comparison. Production XML never enters this path.
    let officialPdf: Buffer | undefined;
    if (shadowEvidence) {
      try {
        officialPdf = await this.officialRtc.renderDanfse(source.content.toString('utf8'));
        shadowEvidence.status = 'success';
        shadowEvidence.official_pdf_sha256 = createHash('sha256').update(officialPdf).digest('hex');
        shadowEvidence.official_pdf_bytes = officialPdf.length;
      } catch {
        // Optional shadow failure must not interrupt the existing renderer.
      }
    }

    const pdf = await this.renderer.render(model, invoice.status);

    // Byte equality is diagnostic only. Semantic comparison, when explicitly
    // enabled, evaluates each PDF independently against the same authorized XML.
    if (shadowEvidence?.status === 'success' && shadowEvidence.official_pdf_sha256 && officialPdf) {
      shadowEvidence.byte_comparison = shadowEvidence.official_pdf_sha256 === createHash('sha256').update(pdf).digest('hex') ? 'identical' : 'different';

      if (semanticShadowEnabled()) {
        const [officialSemantic, localSemantic] = await Promise.all([
          assessPdfAgainstXmlModel(officialPdf, model),
          assessPdfAgainstXmlModel(pdf, model),
        ]);
        shadowEvidence.semantic = {
          official: officialSemantic,
          local: localSemantic,
        };
        shadowEvidence.semantic_assessment = aggregateSemantic(officialSemantic, localSemantic);
      } else {
        shadowEvidence.semantic_assessment = 'not_assessed';
      }
    }

    return this.documents.save({
      invoiceId,
      kind: 'danfse-pdf',
      content: pdf,
      contentType: 'application/pdf',
      metadata: {
        specification: model.specVersion,
        compliance_mode: process.env.TAXAGENT_DANFSE_RENDERER_MODE ?? 'draft',
        source_sha256: source.sha256,
        ...(shadowEvidence ? {
          official_shadow: {
            ...shadowEvidence,
            local_pdf_sha256: createHash('sha256').update(pdf).digest('hex'),
            local_pdf_bytes: pdf.length,
          },
        } : {}),
      },
    });
  }
}
