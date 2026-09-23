import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export interface AbrasfRpsInput {
  number: string;
  series: string;
  issuedAt: string;
  providerTaxId: string;
  municipalRegistration?: string | null;
  customerTaxId: string;
  customerName: string;
  customerAddress: { street: string; number: string; district: string; postalCode: string; cityCode: string };
  serviceCode: string;
  nbsCode: string;
  description: string;
  amount: number;
  issRate?: number;
  issWithholding: '1' | '2' | '3';
  issExigibility: '1' | '2' | '3' | '4' | '5' | '6' | '7';
  serviceCityCode: string;
}

const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const money = (value: number) => value.toFixed(2);
const digits = (value: string) => value.replace(/\D/g, '');
const UF_BY_IBGE_PREFIX: Record<string, string> = {
  '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF',
};

function normalizeServiceItem(value: string): string {
  const raw = value.trim();
  if (/^\d{2}\.\d{2}$/.test(raw)) return raw;
  const onlyDigits = digits(raw);
  if (onlyDigits.length >= 4) return `${onlyDigits.slice(0, 2)}.${onlyDigits.slice(2, 4)}`;
  throw new FiscalEngineError('TA_GISS_SERVICE_ITEM_INVALID', 'GISS ItemListaServico must identify an LC 116 subitem', false);
}

export function buildAbrasfRps(input: AbrasfRpsInput): string {
  const provider = digits(input.providerTaxId);
  const customer = digits(input.customerTaxId);
  const nbs = digits(input.nbsCode);
  const customerCity = digits(input.customerAddress.cityCode);
  const postalCode = digits(input.customerAddress.postalCode);
  const uf = UF_BY_IBGE_PREFIX[customerCity.slice(0, 2)];
  if (provider.length !== 14) throw new FiscalEngineError('TA_GISS_PROVIDER_CNPJ_INVALID', 'GISS RPS requires a 14-digit provider CNPJ', false);
  if (![11, 14].includes(customer.length)) throw new FiscalEngineError('TA_GISS_CUSTOMER_TAX_ID_INVALID', 'GISS RPS customer tax id must be CPF or CNPJ', false);
  if (!/^\d{7}$/.test(input.serviceCityCode) || !/^\d{7}$/.test(customerCity)) throw new FiscalEngineError('TA_GISS_CITY_CODE_INVALID', 'GISS RPS requires 7-digit municipality codes', false);
  if (nbs.length !== 9) throw new FiscalEngineError('TA_GISS_NBS_REQUIRED', 'Current GISS layout requires a 9-digit NBS code', false);
  if (postalCode.length !== 8 || !uf) throw new FiscalEngineError('TA_GISS_CUSTOMER_ADDRESS_INVALID', 'Current GISS layout requires a complete Brazilian customer address', false);
  const item = normalizeServiceItem(input.serviceCode);
  const customerId = customer.length === 14 ? `<CpfCnpj><Cnpj>${customer}</Cnpj></CpfCnpj>` : `<CpfCnpj><Cpf>${customer}</Cpf></CpfCnpj>`;
  const issuedDate = input.issuedAt.slice(0, 10);
  const issRetido = input.issWithholding === '1' ? '2' : '1';
  const responsavelRetencao = input.issWithholding === '2' ? '<ResponsavelRetencao>1</ResponsavelRetencao>' : input.issWithholding === '3' ? '<ResponsavelRetencao>2</ResponsavelRetencao>' : '';
  const address = `<Endereco><Endereco>${esc(input.customerAddress.street)}</Endereco><Numero>${esc(input.customerAddress.number)}</Numero><Bairro>${esc(input.customerAddress.district)}</Bairro><CodigoMunicipio>${customerCity}</CodigoMunicipio><Uf>${uf}</Uf><Cep>${postalCode}</Cep></Endereco>`;
  return `<Rps><InfDeclaracaoPrestacaoServico Id="RPS${esc(input.number)}"><Rps><IdentificacaoRps><Numero>${esc(input.number)}</Numero><Serie>${esc(input.series)}</Serie><Tipo>1</Tipo></IdentificacaoRps><DataEmissao>${issuedDate}</DataEmissao><Status>1</Status></Rps><Competencia>${issuedDate}</Competencia><Servico><Valores><ValorServicos>${money(input.amount)}</ValorServicos>${input.issRate == null ? '' : `<Aliquota>${(input.issRate / 100).toFixed(4)}</Aliquota>`}</Valores><IssRetido>${issRetido}</IssRetido>${responsavelRetencao}<ItemListaServico>${item}</ItemListaServico><CodigoNbs>${nbs}</CodigoNbs><Discriminacao>${esc(input.description)}</Discriminacao><CodigoMunicipio>${input.serviceCityCode}</CodigoMunicipio><ExigibilidadeISS>${input.issExigibility}</ExigibilidadeISS><MunicipioIncidencia>${input.serviceCityCode}</MunicipioIncidencia></Servico><Prestador><CpfCnpj><Cnpj>${provider}</Cnpj></CpfCnpj>${input.municipalRegistration ? `<InscricaoMunicipal>${esc(input.municipalRegistration)}</InscricaoMunicipal>` : ''}</Prestador><TomadorServico><IdentificacaoTomador>${customerId}</IdentificacaoTomador><RazaoSocial>${esc(input.customerName)}</RazaoSocial>${address}</TomadorServico><OptanteSimplesNacional>2</OptanteSimplesNacional><IncentivoFiscal>2</IncentivoFiscal></InfDeclaracaoPrestacaoServico></Rps>`;
}
