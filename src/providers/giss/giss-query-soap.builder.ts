import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export type SoapEnvelopeVersion = '1.1' | '1.2';

export interface GissQuerySoapInput {
  targetNamespace: string;
  requestWrapper: string;
  soapVersion: SoapEnvelopeVersion;
  headerXml: string;
  dataXml: string;
}

const esc = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

export function buildGissQuerySoapEnvelope(input: GissQuerySoapInput): string {
  if (!/^https?:\/\//i.test(input.targetNamespace) && !/^urn:/i.test(input.targetNamespace)) {
    throw new FiscalEngineError('TA_GISS_SOAP_NAMESPACE_UNVERIFIED', 'GISS SOAP target namespace must come from the authenticated WSDL', false, { transmission_attempted: false });
  }
  if (input.requestWrapper !== 'ConsultarNfsePorRpsRequest') {
    throw new FiscalEngineError('TA_GISS_QUERY_WRAPPER_UNVERIFIED', 'GISS query SOAP wrapper must be the exact authenticated WSDL ConsultarNfsePorRpsRequest wrapper', false, { wrapper: input.requestWrapper, transmission_attempted: false });
  }
  if (!input.headerXml.includes('<cabecalho') || !input.dataXml.includes('<ConsultarNfseRpsEnvio')) {
    throw new FiscalEngineError('TA_GISS_QUERY_PAYLOAD_INVALID', 'GISS query requires verified cabecalho and ConsultarNfseRpsEnvio XML payloads', false, { transmission_attempted: false });
  }

  const soapNs = input.soapVersion === '1.2'
    ? 'http://www.w3.org/2003/05/soap-envelope'
    : 'http://schemas.xmlsoap.org/soap/envelope/';

  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${soapNs}" xmlns:tns="${esc(input.targetNamespace)}"><soapenv:Header/><soapenv:Body><tns:${input.requestWrapper}><nfseCabecMsg>${esc(input.headerXml)}</nfseCabecMsg><nfseDadosMsg>${esc(input.dataXml)}</nfseDadosMsg></tns:${input.requestWrapper}></soapenv:Body></soapenv:Envelope>`;
}
