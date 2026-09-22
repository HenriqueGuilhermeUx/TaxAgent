import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export interface GissRpsQueryInput { providerTaxId: string; municipalRegistration?: string | null; number: string; series: string }

const digits = (value: string) => value.replace(/\D/g, '');
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function buildConsultarNfsePorRps(input: GissRpsQueryInput): string {
  const cnpj = digits(input.providerTaxId);
  if (cnpj.length !== 14) throw new FiscalEngineError('TA_GISS_PROVIDER_CNPJ_INVALID', 'GISS RPS query requires a 14-digit provider CNPJ', false);
  if (!input.number || !input.series) throw new FiscalEngineError('TA_GISS_RPS_IDENTITY_REQUIRED', 'GISS RPS query requires number and series', false);
  return `<ConsultarNfseRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd"><IdentificacaoRps><Numero>${esc(input.number)}</Numero><Serie>${esc(input.series)}</Serie><Tipo>1</Tipo></IdentificacaoRps><Prestador><CpfCnpj><Cnpj>${cnpj}</Cnpj></CpfCnpj>${input.municipalRegistration ? `<InscricaoMunicipal>${esc(input.municipalRegistration)}</InscricaoMunicipal>` : ''}</Prestador></ConsultarNfseRpsEnvio>`;
}
