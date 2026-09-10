import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CanonicalFiscalDocument, DocumentIntakeRequest } from './document-intake.types';

function first(xml: string, names: string[]): string | undefined {
  for (const name of names) {
    const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]+)</${name}>`, 'i'));
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function digits(value?: string): string | undefined {
  const normalized = value?.replace(/\D/g, '');
  return normalized || undefined;
}

@Injectable()
export class DocumentIntakeService {
  extract(input: DocumentIntakeRequest): CanonicalFiscalDocument {
    if (!input?.content?.trim()) throw new BadRequestException('Document content is required');
    if (input.source_type === 'xml') return this.extractXml(input.content);

    return {
      schema_version: 'taxagent.document-intake.v1',
      document_type: 'unknown',
      source_type: 'text',
      authority: 'unverified_text',
      confidence: 0,
      supplier: {},
      customer: {},
      raw: { sha256: this.sha(input.content) },
      missing: ['verified_fiscal_source'],
      warnings: ['Text intake is non-authoritative and must not create fiscal or ledger effects automatically.'],
    };
  }

  private extractXml(xml: string): CanonicalFiscalDocument {
    if (!/^\s*<\?xml|^\s*</i.test(xml)) throw new BadRequestException('Invalid XML input');

    const looksLikeNfse = /<NFS[eE]|<infNFSe|<DPS|<infDPS/i.test(xml);
    const amountRaw = first(xml, ['vLiq', 'vServ', 'vNF', 'vTotal']);
    const amount = amountRaw ? Number(amountRaw.replace(',', '.')) : undefined;
    const supplierTaxId = digits(first(xml, ['CNPJ', 'CPF']));
    const number = first(xml, ['nNFSe', 'nNF', 'nDPS']);
    const issuedAt = first(xml, ['dhEmi', 'dEmi', 'dhProc']);
    const missing: string[] = [];

    if (!supplierTaxId) missing.push('supplier_tax_id');
    if (!number) missing.push('document_number');
    if (amount === undefined || !Number.isFinite(amount)) missing.push('total_amount');

    return {
      schema_version: 'taxagent.document-intake.v1',
      document_type: looksLikeNfse ? 'nfse' : 'unknown',
      source_type: 'xml',
      authority: 'fiscal_xml',
      confidence: looksLikeNfse ? 1 : 0.5,
      supplier: { tax_id: supplierTaxId },
      customer: {},
      document_number: number,
      issued_at: issuedAt,
      total: amount !== undefined && Number.isFinite(amount) ? { amount, currency: 'BRL' } : undefined,
      raw: { sha256: this.sha(xml) },
      missing,
      warnings: looksLikeNfse ? [] : ['XML format is not yet a vetted TaxAgent fiscal document family.'],
    };
  }

  private sha(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }
}
