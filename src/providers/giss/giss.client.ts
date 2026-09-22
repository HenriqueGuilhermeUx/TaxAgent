import { Injectable } from '@nestjs/common';
import * as https from 'node:https';
import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { gissEndpointPolicy } from './giss-endpoints';
import { buildConsultarNfsePorRps, GissRpsQueryInput } from './giss-query.builder';

export interface GissProbeResult { host: string; path: string; status: number; reachable: boolean }

@Injectable()
export class GissClient {
  async probe(cityCode: string): Promise<GissProbeResult> {
    const endpoint = gissEndpointPolicy(cityCode);
    if (!endpoint) throw new FiscalEngineError('TA_GISS_CITY_UNSUPPORTED', `No GISS endpoint policy is registered for municipality ${cityCode}`, false);
    const url = new URL(endpoint.homologationWsdl);
    return new Promise((resolve, reject) => {
      const request = https.request({ hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET', minVersion: 'TLSv1.2', timeout: 10000 }, (response) => {
        response.resume();
        resolve({ host: url.hostname, path: url.pathname, status: response.statusCode ?? 0, reachable: (response.statusCode ?? 500) < 500 });
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
