import { Injectable, NotFoundException } from '@nestjs/common';
import { createId } from '../common/id';
import { DatabaseService } from '../database/database.service';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { TenancyService } from '../tenancy/tenancy.service';
import { DocWalletEvidenceClient } from './docwallet-evidence.client';

export type EvidenceKind = 'customer_document' | 'fiscal_document' | 'regulatory_source' | 'operation_dossier';

@Injectable()
export class DocumentEvidenceService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tenancy: TenancyService,
    private readonly docWallet: DocWalletEvidenceClient,
  ) {}

  configured() {
    return this.docWallet.configured();
  }

  async overview(companyId: string, environment: FiscalEnvironment) {
    const company = await this.tenancy.getCompany(companyId);
    const refs = await this.localRefs(companyId, environment, 50);
    const regulatory = await this.regulatoryChanges(companyId);
    let remoteSummary: any = null;
    let evidenceEngineStatus = this.configured() ? 'configured' : 'not_configured';
    if (this.configured()) {
      try {
        await this.docWallet.provision(companyId, String(company.name ?? companyId));
        const result = await this.docWallet.summary(companyId);
        remoteSummary = result?.summary ?? null;
        evidenceEngineStatus = 'ok';
      } catch {
        evidenceEngineStatus = 'unavailable';
      }
    }
    return {
      company: this.safeCompany(company),
      environment,
      evidence_engine: {
        status: evidenceEngineStatus,
        customer_visible_brand: 'TaxAgent',
        raw_files_stored_in_taxagent: false,
        raw_ocr_stored_in_taxagent: false,
      },
      summary: {
        local_references: refs.length,
        remote: remoteSummary,
        regulatory_changes: regulatory.length,
        regulatory_actions_required: regulatory.filter((item) => item.requires_action).length,
      },
      recent_documents: refs,
      regulatory_changes: regulatory.slice(0, 20),
    };
  }

  async upload(companyId: string, environment: FiscalEnvironment, input: {
    filename: string;
    title?: string;
    mime_type?: string;
    document_type?: string;
    evidence_kind?: EvidenceKind;
    category?: string;
    data_base64: string;
    source_context?: Record<string, unknown>;
  }) {
    const company = await this.tenancy.getCompany(companyId);
    await this.docWallet.provision(companyId, String(company.name ?? companyId));
    const uploaded = await this.docWallet.uploadDocument(companyId, {
      filename: input.filename,
      title: input.title ?? input.filename,
      mimeType: input.mime_type ?? 'application/octet-stream',
      documentType: input.document_type ?? 'other',
      category: input.category ?? 'taxagent-evidence',
      dataBase64: input.data_base64,
    });
    const document = uploaded?.document;
    if (!document?.id || !document?.sha256) throw new NotFoundException('Document evidence engine did not return a document reference');
    const id = createId('evid');
    const { rows } = await this.db.query(
      `INSERT INTO document_evidence_refs(
         id, company_id, environment, docwallet_document_id, evidence_kind, title, document_type, sha256, intelligence_status, source_context
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT(company_id, environment, docwallet_document_id)
       DO UPDATE SET title=EXCLUDED.title, document_type=EXCLUDED.document_type, source_context=EXCLUDED.source_context, updated_at=NOW()
       RETURNING id, company_id, environment, docwallet_document_id, evidence_kind, title, document_type, sha256, intelligence_status, source_context, created_at, updated_at`,
      [
        id,
        companyId,
        environment,
        String(document.id),
        input.evidence_kind ?? 'customer_document',
        String(document.name ?? input.title ?? input.filename),
        String(document.type ?? input.document_type ?? 'other'),
        String(document.sha256),
        null,
        JSON.stringify(input.source_context ?? {}),
      ],
    );
    return {
      evidence: rows[0],
      reused: Boolean(uploaded?.reused),
      safeguards: this.safeguards(),
    };
  }

  async list(companyId: string, environment: FiscalEnvironment, limit = 50) {
    await this.tenancy.getCompany(companyId);
    return {
      documents: await this.localRefs(companyId, environment, limit),
      safeguards: this.safeguards(),
    };
  }

  async analyze(companyId: string, environment: FiscalEnvironment, documentId: string) {
    const existing = await this.findRef(companyId, environment, documentId);
    const result = await this.docWallet.analyzeDocument(companyId, documentId);
    const intelligence = result?.intelligence ?? null;
    const status = String(intelligence?.status ?? 'analyzed');
    const docType = intelligence?.documentType ? String(intelligence.documentType) : existing.document_type;
    const title = intelligence?.title ? String(intelligence.title) : existing.title;
    await this.db.query(
      `UPDATE document_evidence_refs SET intelligence_status=$4, document_type=$5, title=$6, updated_at=NOW()
       WHERE company_id=$1 AND environment=$2 AND docwallet_document_id=$3`,
      [companyId, environment, documentId, status, docType, title],
    );
    return {
      document: { ...existing, intelligence_status: status, document_type: docType, title },
      intelligence,
      safeguards: this.safeguards(),
    };
  }

  async intelligence(companyId: string, environment: FiscalEnvironment, documentId: string) {
    await this.findRef(companyId, environment, documentId);
    const result = await this.docWallet.intelligence(companyId, documentId);
    return { intelligence: result?.intelligence ?? null, safeguards: this.safeguards() };
  }

  async audit(companyId: string, environment: FiscalEnvironment, documentId: string) {
    await this.findRef(companyId, environment, documentId);
    const result = await this.docWallet.audit(companyId, documentId);
    return { events: result?.events ?? [], safeguards: this.safeguards() };
  }

  async regulatoryChanges(companyId: string) {
    const company = await this.tenancy.getCompany(companyId);
    const cityCode = String(company.city_code ?? '');
    const taxRegime = String(company.tax_regime ?? '');
    const { rows } = await this.db.query<any>(
      `SELECT id, title, summary, source_url, published_at, effective_at, source_sha256, docwallet_document_id,
              affected_city_codes, affected_tax_regimes, affected_routes, requires_action, metadata, created_at
       FROM fiscal_regulatory_changes
       WHERE status='published'
         AND (cardinality(affected_city_codes)=0 OR $1=ANY(affected_city_codes))
         AND (cardinality(affected_tax_regimes)=0 OR $2='' OR $2=ANY(affected_tax_regimes))
       ORDER BY COALESCE(effective_at, published_at::date) DESC NULLS LAST, created_at DESC
       LIMIT 100`,
      [cityCode, taxRegime],
    );
    return rows.map((row) => ({ ...row, source_verified_by_hash: Boolean(row.source_sha256), raw_source_returned: false }));
  }

  async createRegulatoryChange(input: {
    title: string;
    summary: string;
    source_url: string;
    published_at?: string;
    effective_at?: string;
    affected_city_codes?: string[];
    affected_tax_regimes?: string[];
    affected_routes?: string[];
    requires_action?: boolean;
    metadata?: Record<string, unknown>;
    source_document?: { filename: string; mime_type?: string; data_base64: string };
  }) {
    let sourceSha: string | null = null;
    let docWalletDocumentId: string | null = null;
    if (input.source_document && this.configured()) {
      const vaultId = 'taxagent-regulatory-sources';
      await this.docWallet.provision(vaultId, 'TaxAgent Regulatory Sources');
      const uploaded = await this.docWallet.uploadDocument(vaultId, {
        filename: input.source_document.filename,
        title: input.title,
        mimeType: input.source_document.mime_type ?? 'application/octet-stream',
        documentType: 'regulatory_source',
        category: 'official-fiscal-rule',
        dataBase64: input.source_document.data_base64,
      });
      sourceSha = uploaded?.document?.sha256 ? String(uploaded.document.sha256) : null;
      docWalletDocumentId = uploaded?.document?.id ? String(uploaded.document.id) : null;
    }
    const id = createId('rule');
    const { rows } = await this.db.query(
      `INSERT INTO fiscal_regulatory_changes(
        id,title,summary,source_url,published_at,effective_at,source_sha256,docwallet_document_id,
        affected_city_codes,affected_tax_regimes,affected_routes,requires_action,metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
       RETURNING id,title,summary,source_url,published_at,effective_at,source_sha256,docwallet_document_id,
                 affected_city_codes,affected_tax_regimes,affected_routes,requires_action,status,metadata,created_at`,
      [
        id, input.title, input.summary, input.source_url, input.published_at ?? null, input.effective_at ?? null,
        sourceSha, docWalletDocumentId, input.affected_city_codes ?? [], input.affected_tax_regimes ?? [],
        input.affected_routes ?? [], Boolean(input.requires_action), JSON.stringify(input.metadata ?? {}),
      ],
    );
    return { change: rows[0], source_evidence_persisted: Boolean(docWalletDocumentId), raw_source_returned: false };
  }

  async dossier(companyId: string, environment: FiscalEnvironment, period: string) {
    const company = await this.tenancy.getCompany(companyId);
    const start = `${period}-01T00:00:00.000Z`;
    const [year, month] = period.split('-').map(Number);
    const next = month === 12 ? `${year + 1}-01-01T00:00:00.000Z` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;
    const [invoiceStats, fiscalDocs, inboxDocs, financialEvidence, reconciliation, evidenceRefs] = await Promise.all([
      this.db.query<any>(
        `SELECT COUNT(*)::int total,
                COUNT(*) FILTER (WHERE status='authorized')::int authorized,
                COUNT(*) FILTER (WHERE status='rejected')::int rejected,
                COUNT(*) FILTER (WHERE status IN ('queued','processing'))::int pending,
                COUNT(*) FILTER (WHERE status='cancelled')::int cancelled
         FROM invoices WHERE company_id=$1 AND environment=$2 AND created_at >= $3 AND created_at < $4`,
        [companyId, environment, start, next],
      ),
      this.db.query<any>(
        `SELECT COUNT(*)::int total FROM fiscal_documents fd
         JOIN invoices i ON i.id=fd.invoice_id
         WHERE i.company_id=$1 AND i.environment=$2 AND fd.created_at >= $3 AND fd.created_at < $4`,
        [companyId, environment, start, next],
      ),
      this.db.query<any>(
        `SELECT COUNT(*)::int total FROM inbox_documents WHERE company_id=$1 AND environment=$2 AND received_at >= $3 AND received_at < $4`,
        [companyId, environment, start, next],
      ),
      this.db.query<any>(
        `SELECT COUNT(*)::int total, COALESCE(SUM(amount),0)::text amount FROM tax_position_financial_evidence
         WHERE company_id=$1 AND environment=$2 AND effective_at >= $3 AND effective_at < $4`,
        [companyId, environment, start, next],
      ),
      this.db.query<any>(
        `SELECT COUNT(*) FILTER (WHERE status IN ('open','investigating'))::int open_total,
                COUNT(*) FILTER (WHERE status IN ('open','investigating') AND severity='high')::int high_open
         FROM reconciliation_cases WHERE company_id=$1 AND environment=$2 AND last_seen_at < $4`,
        [companyId, environment, start, next],
      ),
      this.db.query<any>(
        `SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE intelligence_status IS NOT NULL)::int analyzed
         FROM document_evidence_refs WHERE company_id=$1 AND environment=$2 AND created_at >= $3 AND created_at < $4`,
        [companyId, environment, start, next],
      ),
    ]);
    const rules = await this.regulatoryChanges(companyId);
    const invoice = invoiceStats.rows[0] ?? { total: 0, authorized: 0, rejected: 0, pending: 0, cancelled: 0 };
    const recon = reconciliation.rows[0] ?? { open_total: 0, high_open: 0 };
    const evid = evidenceRefs.rows[0] ?? { total: 0, analyzed: 0 };
    const components = [
      { id: 'fiscal_flow', label: 'Fluxo fiscal', status: Number(invoice.rejected) === 0 && Number(invoice.pending) === 0 ? 'complete' : 'attention' },
      { id: 'reconciliation', label: 'Conciliação', status: Number(recon.high_open) === 0 ? 'complete' : 'attention' },
      { id: 'document_evidence', label: 'Evidência documental', status: Number(evid.total) > 0 ? 'complete' : 'not_observed' },
      { id: 'regulatory_actions', label: 'Mudanças fiscais', status: rules.some((item) => item.requires_action) ? 'attention' : 'complete' },
    ];
    const applicable = components.filter((item) => item.status !== 'not_observed');
    const complete = applicable.filter((item) => item.status === 'complete').length;
    const completeness = applicable.length ? Math.round((complete / applicable.length) * 100) : 100;
    return {
      company: this.safeCompany(company),
      environment,
      period,
      operational_evidence_completeness: completeness,
      methodology: 'Deterministic operational evidence coverage. This is not a legal or accounting compliance certification.',
      components,
      metrics: {
        invoices: invoice,
        fiscal_documents: Number(fiscalDocs.rows[0]?.total ?? 0),
        inbox_documents: Number(inboxDocs.rows[0]?.total ?? 0),
        financial_evidence: financialEvidence.rows[0] ?? { total: 0, amount: '0' },
        reconciliation: recon,
        document_evidence: evid,
        regulatory_changes: rules.length,
        regulatory_actions_required: rules.filter((item) => item.requires_action).length,
      },
      evidence_manifest: {
        raw_documents_embedded: false,
        raw_fiscal_payloads_embedded: false,
        document_hash_references_available: Number(evid.total) > 0,
      },
      generated_at: new Date().toISOString(),
    };
  }

  private async localRefs(companyId: string, environment: FiscalEnvironment, limit: number) {
    const { rows } = await this.db.query<any>(
      `SELECT id, company_id, environment, docwallet_document_id, evidence_kind, title, document_type, sha256,
              intelligence_status, source_context, created_at, updated_at
       FROM document_evidence_refs WHERE company_id=$1 AND environment=$2 ORDER BY created_at DESC LIMIT $3`,
      [companyId, environment, Math.max(1, Math.min(200, limit))],
    );
    return rows;
  }

  private async findRef(companyId: string, environment: FiscalEnvironment, documentId: string) {
    const { rows } = await this.db.query<any>(
      `SELECT id, company_id, environment, docwallet_document_id, evidence_kind, title, document_type, sha256,
              intelligence_status, source_context, created_at, updated_at
       FROM document_evidence_refs WHERE company_id=$1 AND environment=$2 AND docwallet_document_id=$3 LIMIT 1`,
      [companyId, environment, documentId],
    );
    if (!rows[0]) throw new NotFoundException('Document evidence reference not found');
    return rows[0];
  }

  private safeCompany(company: any) {
    return { id: company.id, name: company.name, city_code: company.city_code, tax_regime: company.tax_regime };
  }

  private safeguards() {
    return {
      customer_visible_brand: 'TaxAgent',
      document_engine: 'private-evidence-engine',
      raw_file_stored_in_taxagent: false,
      raw_ocr_stored_in_taxagent: false,
      fiscal_decision_delegated_to_document_engine: false,
      fiscal_transmission_attempted: false,
      fiscal_emission_attempted: false,
    };
  }
}
