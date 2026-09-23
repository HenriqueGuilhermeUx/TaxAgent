import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as https from 'node:https';
import { CertificateMaterial } from '../../certificates/certificate-vault.service';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { gissEndpointPolicy } from './giss-endpoints';
import { buildConsultarNfsePorRps, GissRpsQueryInput } from './giss-query.builder';

export interface GissProbeResult { host: string; path: string; status: number; reachable: boolean }
export interface GissWsdlInspection extends GissProbeResult {
  bytes: number;
  sha256: string;
  contentType?: string;
  targetNamespace?: string;
  operations: string[];
  soapActions: string[];
  isWsdl: boolean;
  requiredOperationsPresent: boolean;
  missingRequiredOperations: string[];
}

export const GISS_REQUIRED_RECONCILIATION_OPERATIONS = ['ConsultarNfsePorRps'] as const;

export function inspectGissWsdlContract(body: string) {
  const targetNamespace = body.match(/targetNamespace\s*=\s*["']([^"']+)["']/i)?.[1];
  const operations = [...body.matchAll(/<(?:\w+:)?operation\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const soapActions = [...body.matchAll(/\bsoapAction\s*=\s*["']([^"']*)["']/gi)].map((match) => match[1]);
  const uniqueOperations = [...new Set(operations)].sort();
  const uniqueSoapActions = [...new Set(soapActions)].sort();
  const isWsdl = /<(?:\w+:)?definitions\b/i.test(body);
  const missingRequiredOperations = GISS_REQUIRED_RECONCILIATION_OPERATIONS.filter((operation) => !uniqueOperations.includes(operation));
  return {
    targetNamespace,
    operations: uniqueOperations,
    soapActions: uniqueSoapActions,
    isWsdl,
    requiredOperationsPresent: isWsdl && missingRequiredOperations.length === 0,
    missingRequiredOperations,
  };
}

@Injectable()
export class GissClient {
  async probe(cityCode: string, material?: CertificateMaterial): Promise<GissProbeResult> {
    const inspection = await this.inspectWsdl(cityCode, material);
    return { host: inspection.host, path: inspection.path, status: inspection.status, reachable: inspection.reachable };
  }

  async inspectWsdl(cityCode: string, material?: CertificateMaterial): Promise<GissWsdlInspection> {
    const endpoint = gissEndpointPolicy(cityCode);
    if (!endpoint) throw new FiscalEngineError('TA_GISS_CITY_UNSUPPORTED', `No GISS endpoint policy is registered for municipality ${cityCode}`, false);
    if (!material) throw new FiscalEngineError('TA_GISS_CLIENT_CERTIFICATE_REQUIRED', 'GISS WSDL access requires ICP-Brasil client-certificate authentication. No network request was sent.', false, { network_attempted: false });
    const url = new URL(endpoint.homologationWsdl);
    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'GET',
        minVersion: 'TLSv1.2',
        cert: material.tlsCertificatePem,
        key: material.tlsPrivateKeyPem,
        timeout: 10000,
        headers: { Accept: 'text/xml, application/wsdl+xml, application/xml' },
      }, (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer | string) => {
          const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += part.length;
          if (bytes > 2 * 1024 * 1024) {
            response.destroy(new Error('GISS WSDL exceeds 2 MiB safety limit'));
            return;
          }
          chunks.push(part);
        });
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          const body = Buffer.concat(chunks).toString('utf8');
          const contract = inspectGissWsdlContract(body);
          resolve({
            host: url.hostname,
            path: url.pathname,
            status,
            reachable: status >= 200 && status < 400,
            bytes: Buffer.byteLength(body, 'utf8'),
            sha256: createHash('sha256').update(body, 'utf8').digest('hex'),
            contentType: Array.isArray(response.headers['content-type']) ? response.headers['content-type'][0] : response.headers['content-type'],
            ...contract,
          });
        });
      });
      request.on('timeout', () => request.destroy(new Error('GISS WSDL probe timeout')));
      request.on('error', reject);
      request.end();
    });
  }

  buildRpsQuery(input: GissRpsQueryInput): string {
    return buildConsultarNfsePorRps(input);
  }

  async queryRps(_cityCode: string, input: GissRpsQueryInput): Promise<never> {
    const requestXml = this.buildRpsQuery(input);
    throw new FiscalEngineError('TA_GISS_QUERY_TRANSPORT_LOCKED', 'GISS ConsultarNfsePorRps request is assembled, but SOAP transport remains locked until the official WSDL operation, SOAPAction, authentication and response contract are verified.', false, { transmission_attempted: false, query_attempted: false, request_bytes: Buffer.byteLength(requestXml, 'utf8') });
  }

  async issueRps(): Promise<never> {
    throw new FiscalEngineError('TA_GISS_TRANSMISSION_LOCKED', 'GISS SOAP transmission is locked until ABRASF request signing, authentication and response reconciliation are validated against the municipal contract.', false, { transmission_attempted: false });
  }
}
