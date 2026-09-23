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
import { inspectGissWsdlTransport, reconciliationTransportBinding, GissSoapVersion, GissWsdlOperationBinding } from './giss-wsdl-binding';

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
  fiscalTransmissionAttempted: false;
  queryAttempted: false;
}

export const GISS_REQUIRED_RECONCILIATION_OPERATIONS = ['ConsultarNfsePorRps'] as const;

export function inspectGissWsdlContract(body: string) {
  const targetNamespace = body.match(/targetNamespace\s*=\s*["']([^"']+)["']/i)?.[1];
  const operations = [...body.matchAll(/<(?:\w+:)?operation\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const soapActions = [...body.matchAll(/\bsoapAction\s*=\s*["']([^"']*)["']/gi)].map((match) => match[1]);
  const requestWrappers = [...body.matchAll(/<(?:\w+:)?element\b[^>]*\bname\s*=\s*["']([^"']*Request)["']/gi)].map((match) => match[1]);
  const uniqueOperations = [...new Set(operations)].sort();
  const uniqueSoapActions = [...new Set(soapActions)].sort();
  const uniqueRequestWrappers = [...new Set(requestWrappers)].sort();
  const transport = inspectGissWsdlTransport(body);
  const reconciliationTransport = reconciliationTransportBinding(transport);
  const isWsdl = /<(?:\w+:)?definitions\b/i.test(body);
  const hasNfseCabecMsg = /\bname\s*=\s*["']nfseCabecMsg["']/i.test(body);
  const hasNfseDadosMsg = /\bname\s*=\s*["']nfseDadosMsg["']/i.test(body);
  const hasOutputXml = /\bname\s*=\s*["']outputXML["']/i.test(body);
  const missingRequiredOperations = GISS_REQUIRED_RECONCILIATION_OPERATIONS.filter((operation) => !uniqueOperations.includes(operation));
  const reconciliationShapePresent = uniqueRequestWrappers.some((name) => /ConsultarNfsePorRpsRequest/i.test(name))
    && hasNfseCabecMsg
    && hasNfseDadosMsg
    && hasOutputXml;
  return {
    targetNamespace,
    operations: uniqueOperations,
    soapActions: uniqueSoapActions,
    soapAddresses: transport.soapAddresses,
    operationBindings: transport.operationBindings,
    requestWrappers: uniqueRequestWrappers,
    hasNfseCabecMsg,
    hasNfseDadosMsg,
    hasOutputXml,
    isWsdl,
    requiredOperationsPresent: isWsdl && missingRequiredOperations.length === 0,
    reconciliationShapePresent,
    reconciliationTransportPresent: reconciliationTransport.proven,
    reconciliationSoapAddress: reconciliationTransport.soapAddress,
    reconciliationSoapAction: reconciliationTransport.soapAction,
    reconciliationSoapVersion: reconciliationTransport.soapVersion,
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

  async prepareRpsQuery(cityCode: string, input: GissRpsQueryInput, material: CertificateMaterial): Promise<GissPreparedQuery> {
    const wsdl = await this.inspectWsdl(cityCode, material);
    const verified = requireVerifiedGissReconciliationTransport(wsdl);
    const requestWrapper = wsdl.requestWrappers.find((name) => name === 'ConsultarNfsePorRpsRequest');
    if (requestWrapper !== 'ConsultarNfsePorRpsRequest') {
      throw new FiscalEngineError('TA_GISS_QUERY_WRAPPER_UNVERIFIED', 'Authenticated WSDL did not expose the exact ConsultarNfsePorRpsRequest wrapper.', false, { transmission_attempted: false, query_attempted: false });
    }
    const body = buildGissQuerySoapEnvelope({
      targetNamespace: verified.targetNamespace,
      requestWrapper,
      soapVersion: verified.soapVersion,
      headerXml: buildGissCabecalho(),
      dataXml: this.buildRpsQuery(input),
    });
    return {
      soapAddress: verified.soapAddress,
      soapAction: verified.soapAction,
      soapVersion: verified.soapVersion,
      requestWrapper,
      targetNamespace: verified.targetNamespace,
      body,
      bodyBytes: Buffer.byteLength(body, 'utf8'),
      bodySha256: createHash('sha256').update(body, 'utf8').digest('hex'),
      fiscalTransmissionAttempted: false,
      queryAttempted: false,
    };
  }

  async queryRps(_cityCode: string, input: GissRpsQueryInput): Promise<never> {
    const requestXml = this.buildRpsQuery(input);
    throw new FiscalEngineError('TA_GISS_QUERY_TRANSPORT_LOCKED', 'GISS ConsultarNfsePorRps request is assembled, but SOAP POST remains locked until authenticated WSDL evidence and response semantics are validated end-to-end.', false, { transmission_attempted: false, query_attempted: false, request_bytes: Buffer.byteLength(requestXml, 'utf8') });
  }

  async issueRps(): Promise<never> {
    throw new FiscalEngineError('TA_GISS_TRANSMISSION_LOCKED', 'GISS SOAP transmission is locked until ABRASF request signing, authentication and response reconciliation are validated against the municipal contract.', false, { transmission_attempted: false });
  }
}
