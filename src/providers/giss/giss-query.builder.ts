import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';
import { GISS_TYPES_NAMESPACE } from './giss-header.builder';

export interface GissRpsQueryInput { providerTaxId: string; municipalRegistration?: string | null; number: string; series: string }

export const GISS_QUERY_NAMESPACE = 'http://www.giss.com.br/consultar-nfse-rps-envio-v2_04.xsd' as const;

const digits = (value: string) => value.replace(/\D/g, '');
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function buildConsultarNfsePorRps(input: GissRpsQueryInput): string {
  const cnpj = digits(input.providerTaxId);
  if (cnpj.length !== 14) throw new FiscalEngineError('TA_GISS_PROVIDER_CNPJ_INVALID', 'GISS RPS query requires a 14-digit provider CNPJ', false);
  if (!input.number || !input.series) throw new FiscalEngineError('TA_GISS_RPS_IDENTITY_REQUIRED', 'GISS RPS query requires number and series', false);
  return `<ConsultarNfseRpsEnvio xmlns="${GISS_QUERY_NAMESPACE}" xmlns:tipos="${GISS_TYPES_NAMESPACE}"><IdentificacaoRps><tipos:Numero>${esc(input.number)}</tipos:Numero><tipos:Serie>${esc(input.series)}</tipos:Serie><tipos:Tipo>1</tipos:Tipo></IdentificacaoRps><Prestador><tipos:CpfCnpj><tipos:Cnpj>${cnpj}</tipos:Cnpj></tipos:CpfCnpj>${input.municipalRegistration ? `<tipos:InscricaoMunicipal>${esc(input.municipalRegistration)}</tipos:InscricaoMunicipal>` : ''}</Prestador></ConsultarNfseRpsEnvio>`;
}
