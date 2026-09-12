import { BadRequestException, Injectable } from '@nestjs/common';

export type OcrStartResult = {
  provider: 'azure_document_intelligence';
  operation_url: string;
  job_id: string;
  api_version: string;
  model_id: 'prebuilt-read';
};

export type OcrPollResult = {
  status: 'running' | 'succeeded' | 'failed';
  text?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AzureDocumentOcrService {
  private readonly apiVersion = '2024-11-30';
  private readonly modelId = 'prebuilt-read';

  enabled(): boolean {
    return process.env.TAXAGENT_DOCUMENT_OCR_PROVIDER === 'azure_document_intelligence';
  }

  async start(content: Buffer): Promise<OcrStartResult> {
    if (!this.enabled()) {
      throw new BadRequestException('Automatic OCR is disabled; set TAXAGENT_DOCUMENT_OCR_PROVIDER=azure_document_intelligence explicitly');
    }
    const { endpoint, key } = this.config();
    const url = new URL(`/documentintelligence/documentModels/${this.modelId}:analyze`, endpoint);
    url.searchParams.set('_overload', 'analyzeDocument');
    url.searchParams.set('api-version', this.apiVersion);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Ocp-Apim-Subscription-Key': key,
        'user-agent': 'TaxAgent-DocumentOCR/0.12',
      },
      body: JSON.stringify({ base64Source: content.toString('base64') }),
      signal: AbortSignal.timeout(this.timeoutMs()),
    });
    if (response.status !== 202) {
      const body = (await response.text()).slice(0, 2000);
      throw new Error(`Azure Document Intelligence analyze failed with HTTP ${response.status}: ${body}`);
    }
    const operationUrl = response.headers.get('operation-location');
    if (!operationUrl) throw new Error('Azure Document Intelligence response did not include Operation-Location');
    this.assertOperationUrl(operationUrl, endpoint);
    const parsed = new URL(operationUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const resultIndex = parts.indexOf('analyzeResults');
    const jobId = resultIndex >= 0 ? parts[resultIndex + 1] : undefined;
    if (!jobId) throw new Error('Azure Document Intelligence Operation-Location did not contain a result id');
    return { provider: 'azure_document_intelligence', operation_url: operationUrl, job_id: jobId, api_version: this.apiVersion, model_id: this.modelId };
  }

  async poll(operationUrl: string): Promise<OcrPollResult> {
    const { endpoint, key } = this.config();
    this.assertOperationUrl(operationUrl, endpoint);
    const response = await fetch(operationUrl, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'user-agent': 'TaxAgent-DocumentOCR/0.12',
      },
      signal: AbortSignal.timeout(this.timeoutMs()),
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 2000);
      throw new Error(`Azure Document Intelligence result polling failed with HTTP ${response.status}: ${body}`);
    }
    const payload: any = await response.json();
    const status = String(payload?.status ?? '').toLowerCase();
    if (status === 'failed') {
      return { status: 'failed', error: String(payload?.error?.message ?? 'Azure Document Intelligence analysis failed').slice(0, 1000), metadata: this.metadata(payload) };
    }
    if (status !== 'succeeded') return { status: 'running', metadata: this.metadata(payload) };
    const text = String(payload?.analyzeResult?.content ?? '');
    if (!text.trim()) return { status: 'failed', error: 'Azure Document Intelligence completed without extracted text', metadata: this.metadata(payload) };
    return { status: 'succeeded', text, metadata: this.metadata(payload) };
  }

  private metadata(payload: any): Record<string, unknown> {
    return {
      api_version: payload?.apiVersion ?? this.apiVersion,
      model_id: payload?.modelId ?? this.modelId,
      string_index_type: payload?.analyzeResult?.stringIndexType,
      pages: Array.isArray(payload?.analyzeResult?.pages) ? payload.analyzeResult.pages.length : undefined,
      paragraphs: Array.isArray(payload?.analyzeResult?.paragraphs) ? payload.analyzeResult.paragraphs.length : undefined,
    };
  }

  private config(): { endpoint: string; key: string } {
    const endpointRaw = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
    if (!endpointRaw || !key) throw new BadRequestException('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY are required for automatic OCR');
    const endpointUrl = new URL(endpointRaw);
    if (endpointUrl.protocol !== 'https:') throw new BadRequestException('Azure Document Intelligence endpoint must use HTTPS');
    const officialHost = endpointUrl.hostname.endsWith('.cognitiveservices.azure.com');
    if (!officialHost && process.env.TAXAGENT_DOCUMENT_OCR_ALLOW_CUSTOM_ENDPOINT !== 'true') {
      throw new BadRequestException('Azure Document Intelligence endpoint host is not an approved cognitiveservices.azure.com host');
    }
    return { endpoint: `${endpointUrl.origin}/`, key };
  }

  private assertOperationUrl(operationUrl: string, endpoint: string) {
    const operation = new URL(operationUrl);
    const configured = new URL(endpoint);
    if (operation.protocol !== 'https:' || operation.origin !== configured.origin) {
      throw new BadRequestException('OCR operation URL does not match the configured Azure Document Intelligence endpoint');
    }
    if (!operation.pathname.includes(`/documentModels/${this.modelId}/analyzeResults/`)) {
      throw new BadRequestException('OCR operation URL is outside the expected prebuilt-read analyze result path');
    }
  }

  private timeoutMs(): number {
    return Math.min(60_000, Math.max(1_000, Number(process.env.TAXAGENT_DOCUMENT_OCR_HTTP_TIMEOUT_MS ?? 20_000)));
  }
}
