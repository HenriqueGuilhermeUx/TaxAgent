import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export type EvidenceEnvironment = 'test' | 'production';

@Injectable()
export class DocWalletEvidenceClient {
  private readonly baseUrl = String(process.env.DOCWALLET_BASE_URL ?? '').trim().replace(/\/$/, '');
  private readonly serviceKey = String(process.env.DOCWALLET_TAXAGENT_SERVICE_KEY ?? '').trim();
  private readonly enabled = String(process.env.TAXAGENT_DOCWALLET_EVIDENCE_ENABLED ?? 'false').toLowerCase() === 'true';
  private readonly timeoutMs = Math.max(1000, Number(process.env.DOCWALLET_EVIDENCE_HTTP_TIMEOUT_MS ?? 15000));

  configured() {
    return this.enabled && Boolean(this.baseUrl && this.serviceKey);
  }

  async health() {
    return this.request('/api/internal/taxagent/health');
  }

  async provision(companyId: string, companyLabel: string) {
    return this.request(`/api/internal/taxagent/companies/${encodeURIComponent(companyId)}/provision`, 'POST', { companyLabel });
  }

  async listDocuments(companyId: string, limit = 50) {
    return this.request(`/api/internal/taxagent/companies/${encodeURIComponent(companyId)}/documents?limit=${Math.max(1, Math.min(200, limit))}`);
  }

  async uploadDocument(companyId: string, body: Record<string, unknown>) {
    return this.request(`/api/internal/taxagent/companies/${encodeURIComponent(companyId)}/documents`, 'POST', body);
  }

  async analyzeDocument(companyId: string, documentId: string) {
    return this.request(`/api/internal/taxagent/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(documentId)}/analyze`, 'POST', {});
  }

  async intelligence(companyId: string, documentId: string) {
    return this.request(`/api/internal/taxagent/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(documentId)}/intelligence`);
  }

  async audit(companyId: string, documentId: string) {
    return this.request(`/api/internal/taxagent/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(documentId)}/audit`);
  }

  async summary(companyId: string) {
    return this.request(`/api/internal/taxagent/companies/${encodeURIComponent(companyId)}/evidence-summary`);
  }

  private async request(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<any> {
    if (!this.configured()) {
      throw new ServiceUnavailableException('Document evidence engine is not configured');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-taxagent-key': this.serviceKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
      if (!response.ok) {
        throw new ServiceUnavailableException(`Document evidence engine HTTP ${response.status}: ${String(payload?.error ?? payload?.message ?? 'request_failed')}`);
      }
      return payload;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message = error instanceof Error ? error.message : 'unknown_error';
      throw new ServiceUnavailableException(`Document evidence engine unavailable: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
