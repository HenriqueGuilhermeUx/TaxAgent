import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as https from 'node:https';
import { CertificateMaterial } from '../../certificates/certificate-vault.service';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { gissEndpointPolicy } from './giss-endpoints';
import { buildGissCabecalho } from './giss-header.builder';
import { buildConsultarNfsePorRps, GissRpsQueryInput } from './giss-query.builder';
import { buildGissQuerySoapEnvelope } from './giss-query-soap.builder';
import { requireVerifiedGissReconciliationTransport } from './giss-query-transport.guard';
import { GissSignatureService } from './giss-signature.service';
import { inspectGissWsdlTransport, reconciliationTransportBinding, GissSoapVersion, GissWsdlOperationBinding } from './giss-wsdl-binding';
import { GissWsdlContractDocument, inspectResolvedGissWsdlShape } from './giss-wsdl-contract';

export interface GissProbeResult { host: string; path: string; status: number; reachable: boolean }
export interface GissWsdlInspection extends GissProbeResult {
  bytes: number;
  sha256: string;
  contentType?: string;
  targetNamespace?: string;
  operations: string[];
  soapActions: string[];
  soapAddresses: string[];
  operationBindings: GissWsdlOperationBinding[];
  requestWrappers: string[];
  hasNfseCabecMsg: boolean;
  hasNfseDadosMsg: boolean;
  hasOutputXml: boolean;
  isWsdl: boolean;
  requiredOperationsPresent: boolean;
  reconciliationShapePresent: boolean;
  reconciliationTransportPresent: boolean;
  reconciliationSoapAddress?: string;
  reconciliationSoapAction?: string;
  reconciliationSoapVersion?: GissSoapVersion;
  reconciliationRequestWrapper?: string;
  reconciliationRequestNamespace?: string;
  reconciliationResponseWrapper?: string;
  reconciliationResponseNamespace?: string;
  requestMessageParts: string[];
  responseMessageParts: string[];
  supportingDocumentsInspected: number;
  sameHostImportsDiscovered: number;
  missingRequiredOperations: string[];
}

export interface GissPreparedQuery {
  soapAddress: string;
  soapAction: string;
  soapVersion: GissSoapVersion;
  requestWrapper: 'ConsultarNfsePorRpsRequest';
  targetNamespace: string;
  body: string;
  bodyBytes: number;
  bodySha256: string;
  queryDataSigned: true;
  querySignatureProfile: 'xmldsig-rsa-sha1-empty-uri';
  fiscalTransmissionAttempted: false;
  queryAttempted: false;
}

export interface GissQueryHttpResponse {
  status: number;
  body: string;
  contentType?: string;
  bodyBytes: number;
  bodySha256: string;
  fiscalTransmissionAttempted: false;
  queryAttempted: true;
}

interface AuthenticatedXmlResponse {
  status: number;
  body: string;
  contentType?: string;
}

export const GISS_REQUIRED_RECONCILIATION_OPERATIONS = ['ConsultarNfsePorRps'] as const;
const MAX_WSDL_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_WSDL_DOCUMENTS = 8;
const MAX_GISS_QUERY_RESPONSE_BYTES = 2 * 1024 * 1024;

export function inspectGissWsdlContract(body: string, supportingDocuments: GissWsdlContractDocument[] = []) {
  const documents: GissWsdlContractDocument[] = [{ url: 'memory://root.wsdl', body }, ...supportingDocuments];
  const resolved = inspectResolvedGissWsdlShape(documents);
  const combined = documents.map((document) => document.body).join('\n');
  const operations = [...combined.matchAll(/<(?:\w+:)?operation\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const soapActions = [...combined.matchAll(/\bsoapAction\s*=\s*["']([^"']*)["']/gi)].map((match) => match[1]);
  const uniqueOperations = [...new Set(operations)].sort();
  const uniqueSoapActions = [...new Set(soapActions)].sort();
  const transport = inspectGissWsdlTransport(combined);
  const reconciliationTransport = reconciliationTransportBinding(transport);
  const isWsdl = /<(?:\w+:)?definitions\b/i.test(body);
  const missingRequiredOperations = GISS_REQUIRED_RECONCILIATION_OPERATIONS.filter((operation) => !uniqueOperations.includes(operation));
  return {
    targetNamespace: resolved.targetNamespace,
    operations: uniqueOperations,
    soapActions: uniqueSoapActions,
    soapAddresses: transport.soapAddresses,
    operationBindings: transport.operationBindings,
    requestWrappers: resolved.requestWrappers,
    hasNfseCabecMsg: resolved.hasNfseCabecMsg,
    hasNfseDadosMsg: resolved.hasNfseDadosMsg,
    hasOutputXml: resolved.hasOutputXml,
    isWsdl,
    requiredOperationsPresent: isWsdl && missingRequiredOperations.length === 0,
    reconciliationShapePresent: resolved.reconciliationShapePresent,
    reconciliationTransportPresent: reconciliationTransport.proven,
    reconciliationSoapAddress: reconciliationTransport.soapAddress,
    reconciliationSoapAction: reconciliationTransport.soapAction,
    reconciliationSoapVersion: reconciliationTransport.soapVersion,
    reconciliationRequestWrapper: resolved.requestWrapper,
    reconciliationRequestNamespace: resolved.requestNamespace,
    reconciliationResponseWrapper: resolved.responseWrapper,
    reconciliationResponseNamespace: resolved.responseNamespace,
    requestMessageParts: resolved.requestMessageParts,
    responseMessageParts: resolved.responseMessageParts,
    supportingDocumentsInspected: resolved.supportingDocumentsInspected,
    missingRequiredOperations,
  };
}

@Injectable()
export class GissClient {
  constructor(private readonly signatures?: GissSignatureService) {}

  async probe(cityCode: string, material?: CertificateMaterial): Promise<GissProbeResult> {
    const inspection = await this.inspectWsdl(cityCode, material);
    return { host: inspection.host, path: inspection.path, status: inspection.status, reachable: inspection.reachable };
  }

  async inspectWsdl(cityCode: string, material?: CertificateMaterial): Promise<GissWsdlInspection> {
    const endpoint = gissEndpointPolicy(cityCode);
    if (!endpoint) throw new FiscalEngineError('TA_GISS_CITY_UNSUPPORTED', `No GISS endpoint policy is registered for municipality ${cityCode}`, false);
    if (!material) throw new FiscalEngineError('TA_GISS_CLIENT_CERTIFICATE_REQUIRED', 'GISS WSDL access requires ICP-Brasil client-certificate authentication. No network request was sent.', false, { network_attempted: false });
    const rootUrl = new URL(endpoint.homologationWsdl);
    const rootResponse = await this.fetchAuthenticatedXml(rootUrl, material);
    const imported = await this.fetchSameHostImports(rootUrl, rootResponse.body, material);
    const contract = inspectGissWsdlContract(rootResponse.body, imported.documents);
    return {
      host: rootUrl.hostname,
      path: rootUrl.pathname,
      status: rootResponse.status,
      reachable: rootResponse.status >= 200 && rootResponse.status < 300,
      bytes: Buffer.byteLength(rootResponse.body, 'utf8'),
      sha256: createHash('sha256').update(rootResponse.body, 'utf8').digest('hex'),
      contentType: rootResponse.contentType,
      ...contract,
      sameHostImportsDiscovered: imported.discovered,
    };
  }

  buildRpsQuery(input: GissRpsQueryInput): string {
    return buildConsultarNfsePorRps(input);
  }

  async prepareRpsQuery(cityCode: string, input: GissRpsQueryInput, material: CertificateMaterial): Promise<GissPreparedQuery> {
    const wsdl = await this.inspectWsdl(cityCode, material);
    const verified = requireVerifiedGissReconciliationTransport(wsdl);
    if (!this.signatures) {
      throw new FiscalEngineError('TA_GISS_QUERY_SIGNER_UNAVAILABLE', 'GISS reconciliation query signing service is unavailable; no query was transmitted.', false, { transmission_attempted: false, query_attempted: false });
    }
    const queryXml = this.buildRpsQuery(input);
    const signedQueryXml = this.signatures.signRpsQuery(queryXml, material);
    const body = buildGissQuerySoapEnvelope({
      targetNamespace: verified.requestNamespace,
      requestWrapper: verified.requestWrapper,
      soapVersion: verified.soapVersion,
      headerXml: buildGissCabecalho(),
      dataXml: signedQueryXml,
    });
    return {
      soapAddress: verified.soapAddress,
      soapAction: verified.soapAction,
      soapVersion: verified.soapVersion,
      requestWrapper: verified.requestWrapper,
      targetNamespace: verified.requestNamespace,
      body,
      bodyBytes: Buffer.byteLength(body, 'utf8'),
      bodySha256: createHash('sha256').update(body, 'utf8').digest('hex'),
      queryDataSigned: true,
      querySignatureProfile: 'xmldsig-rsa-sha1-empty-uri',
      fiscalTransmissionAttempted: false,
      queryAttempted: false,
    };
  }

  async executePreparedRpsQuery(cityCode: string, prepared: GissPreparedQuery, material: CertificateMaterial): Promise<GissQueryHttpResponse> {
    const policy = gissEndpointPolicy(cityCode);
    if (!policy) throw new FiscalEngineError('TA_GISS_CITY_UNSUPPORTED', `No GISS endpoint policy is registered for municipality ${cityCode}`, false);

    const expectedHost = new URL(policy.homologationWsdl).hostname;
    let endpoint: URL;
    try {
      endpoint = new URL(prepared.soapAddress);
    } catch {
      throw new FiscalEngineError('TA_GISS_QUERY_ENDPOINT_UNVERIFIED', 'Verified GISS reconciliation endpoint is not a valid HTTPS URL.', false, { transmission_attempted: false, query_attempted: false });
    }
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== expectedHost) {
      throw new FiscalEngineError('TA_GISS_QUERY_ENDPOINT_UNVERIFIED', 'GISS reconciliation POST is restricted to the authenticated homologation WSDL host.', false, {
        transmission_attempted: false,
        query_attempted: false,
        endpoint_host_verified: false,
      });
    }

    try {
      const response = await this.postAuthenticatedSoap(endpoint, prepared, material);
      return {
        status: response.status,
        body: response.body,
        contentType: response.contentType,
        bodyBytes: Buffer.byteLength(response.body, 'utf8'),
        bodySha256: createHash('sha256').update(response.body, 'utf8').digest('hex'),
        fiscalTransmissionAttempted: false,
        queryAttempted: true,
      };
    } catch (error) {
      if (error instanceof FiscalEngineError) throw error;
      const networkCode = typeof error === 'object' && error !== null && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined;
      throw new FiscalEngineError(
        'TA_GISS_QUERY_NETWORK_ERROR',
        'Authenticated GISS reconciliation query failed at the network/TLS layer. No RPS emission was attempted.',
        true,
        {
          transmission_attempted: false,
          query_attempted: true,
          ...(networkCode ? { network_code: networkCode } : {}),
        },
      );
    }
  }

  async queryRps(cityCode: string, input: GissRpsQueryInput, material: CertificateMaterial) {
    const prepared = await this.prepareRpsQuery(cityCode, input, material);
    const response = await this.executePreparedRpsQuery(cityCode, prepared, material);
    return { prepared, response };
  }

  async issueRps(): Promise<never> {
    throw new FiscalEngineError('TA_GISS_TRANSMISSION_LOCKED', 'GISS SOAP transmission is locked until ABRASF request signing, authentication and response reconciliation are validated against the municipal contract.', false, { transmission_attempted: false });
  }

  private async fetchSameHostImports(rootUrl: URL, rootBody: string, material: CertificateMaterial) {
    const queue = this.importLocations(rootBody, rootUrl);
    const seen = new Set<string>([rootUrl.toString()]);
    const documents: GissWsdlContractDocument[] = [];
    let discovered = 0;

    while (queue.length > 0 && documents.length < MAX_WSDL_DOCUMENTS - 1) {
      const next = queue.shift()!;
      if (seen.has(next.toString())) continue;
      seen.add(next.toString());
      if (next.protocol !== 'https:' || next.hostname !== rootUrl.hostname) continue;
      discovered += 1;
      const response = await this.fetchAuthenticatedXml(next, material);
      if (response.status < 200 || response.status >= 300) {
        throw new FiscalEngineError('TA_GISS_WSDL_IMPORT_UNREACHABLE', 'Authenticated GISS WSDL supporting document could not be loaded from the verified service host.', true, { network_attempted: true, status: response.status, transmission_attempted: false, query_attempted: false });
      }
      documents.push({ url: next.toString(), body: response.body });
      for (const child of this.importLocations(response.body, next)) {
        if (!seen.has(child.toString()) && child.protocol === 'https:' && child.hostname === rootUrl.hostname) queue.push(child);
      }
    }

    if (queue.some((candidate) => candidate.protocol === 'https:' && candidate.hostname === rootUrl.hostname)) {
      throw new FiscalEngineError('TA_GISS_WSDL_IMPORT_LIMIT', 'GISS WSDL import graph exceeds the authenticated diagnostic safety limit.', false, { network_attempted: true, transmission_attempted: false, query_attempted: false });
    }
    return { documents, discovered };
  }

  private importLocations(body: string, baseUrl: URL): URL[] {
    const result: URL[] = [];
    const pattern = /<(?:\w+:)?(?:import|include)\b([^>]*)>/gi;
    for (const match of body.matchAll(pattern)) {
      const location = match[1].match(/\b(?:schemaLocation|location)\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!location) continue;
      try {
        result.push(new URL(location, baseUrl));
      } catch {
        continue;
      }
    }
    return result;
  }

  private fetchAuthenticatedXml(url: URL, material: CertificateMaterial): Promise<AuthenticatedXmlResponse> {
    return new Promise((resolve, reject) => {
      const request = https.request({
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
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
          if (bytes > MAX_WSDL_DOCUMENT_BYTES) {
            response.destroy(new Error('GISS WSDL document exceeds 2 MiB safety limit'));
            return;
          }
          chunks.push(part);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            contentType: Array.isArray(response.headers['content-type']) ? response.headers['content-type'][0] : response.headers['content-type'],
          });
        });
      });
      request.on('timeout', () => request.destroy(new Error('GISS WSDL probe timeout')));
      request.on('error', reject);
      request.end();
    });
  }

  private postAuthenticatedSoap(url: URL, prepared: GissPreparedQuery, material: CertificateMaterial): Promise<AuthenticatedXmlResponse> {
    return new Promise((resolve, reject) => {
      const body = Buffer.from(prepared.body, 'utf8');
      const contentType = prepared.soapVersion === '1.2'
        ? `application/soap+xml; charset=utf-8; action="${prepared.soapAction}"`
        : 'text/xml; charset=utf-8';
      const headers: Record<string, string | number> = {
        Accept: 'text/xml, application/soap+xml, application/xml',
        'Content-Type': contentType,
        'Content-Length': body.length,
      };
      if (prepared.soapVersion === '1.1') headers.SOAPAction = `"${prepared.soapAction}"`;

      const request = https.request({
        hostname: url.hostname,
        port: url.port ? Number(url.port) : 443,
        path: url.pathname + url.search,
        method: 'POST',
        minVersion: 'TLSv1.2',
        cert: material.tlsCertificatePem,
        key: material.tlsPrivateKeyPem,
        timeout: 15000,
        headers,
      }, (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer | string) => {
          const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += part.length;
          if (bytes > MAX_GISS_QUERY_RESPONSE_BYTES) {
            response.destroy(new Error('GISS reconciliation response exceeds 2 MiB safety limit'));
            return;
          }
          chunks.push(part);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            contentType: Array.isArray(response.headers['content-type']) ? response.headers['content-type'][0] : response.headers['content-type'],
          });
        });
      });
      request.on('timeout', () => request.destroy(new Error('GISS reconciliation query timeout')));
      request.on('error', reject);
      request.end(body);
    });
  }
}
