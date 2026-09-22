import { Injectable } from '@nestjs/common';
import { FiscalDocumentsService } from '../../documents/fiscal-documents.service';

export type GissArtifactKind = 'giss_rps_xml' | 'giss_rps_signed_xml' | 'giss_soap_request' | 'giss_soap_response' | 'giss_nfse_xml';

@Injectable()
export class GissArtifactsService {
  constructor(private readonly documents: FiscalDocumentsService) {}

  save(invoiceId: string, kind: GissArtifactKind, content: string, metadata?: Record<string, unknown>) {
    return this.documents.save({
      invoiceId,
      kind,
      content,
      contentType: kind === 'giss_soap_request' || kind === 'giss_soap_response' ? 'application/soap+xml' : 'application/xml',
      metadata: { provider: 'giss', immutable_artifact: true, ...(metadata ?? {}) },
    });
  }
}
