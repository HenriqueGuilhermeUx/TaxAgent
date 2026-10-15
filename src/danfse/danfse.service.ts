import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FiscalDocumentsService } from '../documents/fiscal-documents.service';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { DanfseParserService } from './danfse-parser.service';
import { DanfseRendererService } from './danfse-renderer.service';

@Injectable()
export class DanfseService {
  constructor(private readonly db: DatabaseService, private readonly documents: FiscalDocumentsService, private readonly parser: DanfseParserService, private readonly renderer: DanfseRendererService) {}

  async generate(invoiceId: string, companyId?: string) {
    const { rows } = await this.db.query<{ company_id: string; status: string; environment: string }>('SELECT company_id, status, environment FROM invoices WHERE id=$1', [invoiceId]);
    const invoice = rows[0];
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (companyId && invoice.company_id !== companyId) throw new ForbiddenException('Invoice belongs to another company');
    if (invoice.environment === 'production' && process.env.TAXAGENT_DANFSE_RENDERER_MODE !== 'verified') throw new FiscalEngineError('TA_DANFSE_RENDERER_UNVERIFIED', 'Production DANFSe rendering is blocked until the NT008 v1.02 renderer and official resources are marked verified', false);

    const source = await this.documents.latestContent(invoiceId, 'nfse-authorized-xml');
    if (!source) throw new NotFoundException('Authorized NFS-e XML not found for invoice');
    const model = this.parser.parse(source.content.toString('utf8'));
    const pdf = await this.renderer.render(model, invoice.status);
    return this.documents.save({ invoiceId, kind: 'danfse-pdf', content: pdf, contentType: 'application/pdf', metadata: { specification: model.specVersion, compliance_mode: process.env.TAXAGENT_DANFSE_RENDERER_MODE ?? 'draft', source_sha256: source.sha256 } });
  }
}
