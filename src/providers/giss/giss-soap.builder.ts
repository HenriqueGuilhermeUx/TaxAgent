import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export interface GissSoapRequest { operation: 'RecepcionarLoteRpsSincrono' | 'ConsultarNfsePorRps' | 'CancelarNfse'; xml: string }

const esc = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function buildGissSoapEnvelope(request: GissSoapRequest): string {
  if (!request.xml.trim().startsWith('<')) throw new FiscalEngineError('TA_GISS_XML_REQUIRED', 'GISS SOAP request requires an XML payload', false);
  const operation = request.operation;
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="http://nfse.abrasf.org.br"><soapenv:Header/><soapenv:Body><nfse:${operation}><nfseXML>${esc(request.xml)}</nfseXML></nfse:${operation}></soapenv:Body></soapenv:Envelope>`;
}
