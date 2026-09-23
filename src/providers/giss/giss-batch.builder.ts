import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export interface GissBatchInput {
  batchNumber: string;
  providerTaxId: string;
  municipalRegistration?: string | null;
  rpsXml: string;
}

const digits = (value: string) => value.replace(/\D/g, '');
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function buildAbrasfLoteRps(input: GissBatchInput): string {
  const cnpj = digits(input.providerTaxId);
  if (cnpj.length !== 14) throw new FiscalEngineError('TA_GISS_PROVIDER_CNPJ_INVALID', 'GISS batch requires a 14-digit provider CNPJ', false);
  if (!input.rpsXml.includes('<InfDeclaracaoPrestacaoServico')) throw new FiscalEngineError('TA_GISS_RPS_XML_INVALID', 'GISS batch requires a validated RPS XML payload', false);
  return `<EnviarLoteRpsSincronoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd"><LoteRps Id="LOTE${esc(input.batchNumber)}" versao="2.04"><NumeroLote>${esc(input.batchNumber)}</NumeroLote><CpfCnpj><Cnpj>${cnpj}</Cnpj></CpfCnpj>${input.municipalRegistration ? `<InscricaoMunicipal>${esc(input.municipalRegistration)}</InscricaoMunicipal>` : ''}<QuantidadeRps>1</QuantidadeRps><ListaRps>${input.rpsXml}</ListaRps></LoteRps></EnviarLoteRpsSincronoEnvio>`;
}
