import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { GISS_SOAP_REQUEST_NAMESPACE } from './giss-wsdl-contract';
import { SoapEnvelopeVersion } from './giss-query-soap.builder';

export interface GissEmissionSoapInput {
  targetNamespace: string;
  requestWrapper: string;
  soapVersion: SoapEnvelopeVersion;
  headerXml: string;
  signedBatchXml: string;
}

const esc = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

export function buildGissEmissionSoapEnvelope(input: GissEmissionSoapInput): string {
  if (input.targetNamespace.replace(/\/+$/, '') !== GISS_SOAP_REQUEST_NAMESPACE.replace(/\/+$/, '')) {
    throw new FiscalEngineError(
      'TA_GISS_EMISSION_NAMESPACE_UNVERIFIED',
      'GISS emission SOAP namespace must be the exact authenticated WSDL ABRASF namespace',
      false,
      { transmission_attempted: false, fiscal_emission_attempted: false },
    );
  }
  if (input.requestWrapper !== 'RecepcionarLoteRpsRequest') {
    throw new FiscalEngineError(
      'TA_GISS_EMISSION_WRAPPER_UNVERIFIED',
      'GISS emission SOAP wrapper must be the exact authenticated WSDL RecepcionarLoteRpsRequest wrapper',
      false,
      { transmission_attempted: false, fiscal_emission_attempted: false },
    );
  }
  if (!input.headerXml.includes('<cabecalho')) {
    throw new FiscalEngineError('TA_GISS_EMISSION_HEADER_INVALID', 'GISS emission requires the verified ABRASF/GISS cabecalho XML', false, { transmission_attempted: false, fiscal_emission_attempted: false });
  }
  if (!input.signedBatchXml.includes('<EnviarLoteRpsEnvio') || !input.signedBatchXml.includes('<LoteRps') || !input.signedBatchXml.includes('<Signature')) {
    throw new FiscalEngineError('TA_GISS_EMISSION_BATCH_INVALID', 'GISS emission requires a signed EnviarLoteRpsEnvio/LoteRps payload', false, { transmission_attempted: false, fiscal_emission_attempted: false });
  }

  const soapNs = input.soapVersion === '1.2'
    ? 'http://www.w3.org/2003/05/soap-envelope'
    : 'http://schemas.xmlsoap.org/soap/envelope/';

  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="${soapNs}" xmlns:tns="${esc(input.targetNamespace)}"><soapenv:Header/><soapenv:Body><tns:${input.requestWrapper}><nfseCabecMsg>${esc(input.headerXml)}</nfseCabecMsg><nfseDadosMsg>${esc(input.signedBatchXml)}</nfseDadosMsg></tns:${input.requestWrapper}></soapenv:Body></soapenv:Envelope>`;
}
