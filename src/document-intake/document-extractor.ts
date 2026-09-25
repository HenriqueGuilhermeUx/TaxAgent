import { CanonicalFiscalDocument, DocumentIntakeRequest } from './document-intake.types';

export interface DocumentExtractorResult {
  canonical: CanonicalFiscalDocument;
  provider: string;
  provider_metadata?: Record<string, unknown>;
}

export interface DocumentExtractor {
  readonly name: string;
  supports(input: DocumentIntakeRequest): boolean;
  extract(input: DocumentIntakeRequest): Promise<DocumentExtractorResult>;
}
