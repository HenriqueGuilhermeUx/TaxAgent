import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { GISS_TYPES_NAMESPACE } from './abrasf-rps.builder';

export interface GissBatchInput {
  batchNumber: string;
  providerTaxId: string;
  municipalRegistration?: string | null;
  rpsXml: string;
}

export const GISS_SEND_BATCH_NAMESPACE = 'http://www.giss.com.br/enviar-lote-rps-envio-v2_04.xsd';

const digits = (value: string) => value.replace(/\D/g, '');
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const t = (name: string, value: string) => `<tipos:${name}>${value}</tipos:${name}>`;

export function buildAbrasfLoteRps(input: GissBatchInput): string {
  const cnpj = digits(input.providerTaxId);
  if (cnpj.length !== 14) throw new FiscalEngineError('TA_GISS_PROVIDER_CNPJ_INVALID', 'GISS batch requires a 14-digit provider CNPJ', false);
  if (!/(?:<|:)InfDeclaracaoPrestacaoServico\b/.test(input.rpsXml)) throw new FiscalEngineError('TA_GISS_RPS_XML_INVALID', 'GISS batch requires a validated RPS XML payload', false);
  const prestador = t('Prestador', t('CpfCnpj', t('Cnpj', cnpj)) + (input.municipalRegistration ? t('InscricaoMunicipal', esc(input.municipalRegistration)) : ''));
  return `<EnviarLoteRpsEnvio xmlns="${GISS_SEND_BATCH_NAMESPACE}" xmlns:tipos="${GISS_TYPES_NAMESPACE}"><LoteRps Id="LOTE${esc(input.batchNumber)}" versao="2.04">`
    + t('NumeroLote', esc(input.batchNumber))
    + prestador
    + t('QuantidadeRps', '1')
    + `<tipos:ListaRps>${input.rpsXml}</tipos:ListaRps>`
    + `</LoteRps></EnviarLoteRpsEnvio>`;
}
