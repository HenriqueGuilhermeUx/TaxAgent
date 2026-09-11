import { BadGatewayException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DocumentExtractor, DocumentExtractorResult } from './document-extractor';
import { CanonicalFiscalDocument, DocumentIntakeRequest } from './document-intake.types';

@Injectable()
export class DocStructExtractorService implements DocumentExtractor {
  readonly name = 'docstruct';

  supports(input: DocumentIntakeRequest): boolean {
    return input.source_type === 'text';
  }

  async extract(input: DocumentIntakeRequest): Promise<DocumentExtractorResult> {
    const baseUrl = process.env.DOCSTRUCT_BASE_URL ?? 'https://docstruct.marwannaili-23-07.workers.dev';
    const timeoutMs = Math.max(1000, Number(process.env.DOCSTRUCT_REQUEST_TIMEOUT_MS ?? 15000));
    const providerType = ['invoice', 'receipt', 'bank_statement', 'contract'].includes(String(input.document_type ?? ''))
      ? String(input.document_type)
      : 'invoice';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
      if (process.env.DOCSTRUCT_BEARER_TOKEN) headers.authorization = `Bearer ${process.env.DOCSTRUCT_BEARER_TOKEN}`;
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/extract`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({ text: input.content, type: providerType, output: 'json' }),
      });
      const raw = await response.text();
      if (!response.ok) throw new BadGatewayException(`DocStruct returned HTTP ${response.status}`);
      let payload: unknown;
      try { payload = raw ? JSON.parse(raw) : {}; } catch { throw new BadGatewayException('DocStruct returned invalid JSON'); }
      const dataValue = this.objectValue(payload, 'data');
      const data = dataValue && typeof dataValue === 'object' && !Array.isArray(dataValue) ? this.asObject(dataValue) : this.asObject(payload);
      return {
        canonical: this.toCanonical(input, data),
        provider: this.name,
        provider_metadata: { endpoint: '/v1/extract', provider_type: providerType, response_ok: this.objectValue(payload, 'ok') ?? true },
      };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new BadGatewayException('DocStruct request timed out');
      throw new BadGatewayException(error instanceof Error ? error.message : 'DocStruct extraction failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private toCanonical(input: DocumentIntakeRequest, data: Record<string, unknown>): CanonicalFiscalDocument {
    const vendor = this.asObject(data.vendor ?? data.supplier ?? data.fornecedor);
    const customer = this.asObject(data.customer ?? data.client ?? data.cliente);
    const number = this.stringValue(data.number ?? data.invoice_number ?? data.numero);
    const issuedAt = this.stringValue(data.date ?? data.issued_at ?? data.issue_date ?? data.data);
    const amount = this.numberValue(data.total ?? data.total_amount ?? data.amount ?? data.valor_total);
    const supplierTaxId = this.taxId(vendor.tax_id ?? vendor.cnpj ?? vendor.cpf ?? data.vendor_tax_id ?? data.cnpj);
    const customerTaxId = this.taxId(customer.tax_id ?? customer.cnpj ?? customer.cpf ?? data.customer_tax_id);
    const documentType = this.stringValue(data.type ?? data.document_type)?.toLowerCase();
    const missing: string[] = ['verified_fiscal_source'];
    if (!supplierTaxId) missing.push('supplier_tax_id');
    if (!number) missing.push('document_number');
    if (amount === undefined) missing.push('total_amount');
    return {
      schema_version: 'taxagent.document-intake.v1',
      document_type: documentType === 'nfse' || documentType === 'nfs-e' ? 'nfse' : 'unknown',
      source_type: 'text',
      authority: 'unverified_text',
      confidence: 0.8,
      supplier: { tax_id: supplierTaxId, name: this.stringValue(vendor.name ?? vendor.nome) },
      customer: { tax_id: customerTaxId, name: this.stringValue(customer.name ?? customer.nome) },
      document_number: number,
      issued_at: issuedAt,
      total: amount === undefined ? undefined : { amount, currency: 'BRL' },
      raw: { sha256: createHash('sha256').update(input.content, 'utf8').digest('hex') },
      missing,
      warnings: ['DocStruct output is extracted data, not an authoritative fiscal source. Human or deterministic fiscal validation is required before ledger effects.'],
      lineage: { provider: this.name, method: 'text-extraction', authoritative: false },
    };
  }

  private asObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  private objectValue(value: unknown, key: string): unknown { return this.asObject(value)[key]; }
  private stringValue(value: unknown): string | undefined { return value === undefined || value === null ? undefined : String(value).trim() || undefined; }
  private numberValue(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const normalized = String(value).replace(/[^0-9,.-]/g, '').replace(',', '.');
    if (!normalized) return undefined;
    const candidate = Number(normalized);
    return Number.isFinite(candidate) ? candidate : undefined;
  }
  private taxId(value: unknown): string | undefined { const normalized = this.stringValue(value)?.replace(/\D/g, ''); return normalized || undefined; }
}
