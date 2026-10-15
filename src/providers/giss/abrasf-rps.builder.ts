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

export const GISS_TYPES_NAMESPACE = 'http://www.giss.com.br/tipos-v2_04.xsd';

const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const money = (value: number) => value.toFixed(2);
const digits = (value: string) => value.replace(/\D/g, '');
const UF_BY_IBGE_PREFIX: Record<string, string> = {
  '11':'RO','12':'AC','13':'AM','14':'RR','15':'PA','16':'AP','17':'TO','21':'MA','22':'PI','23':'CE','24':'RN','25':'PB','26':'PE','27':'AL','28':'SE','29':'BA','31':'MG','32':'ES','33':'RJ','35':'SP','41':'PR','42':'SC','43':'RS','50':'MS','51':'MT','52':'GO','53':'DF',
};
const t = (name: string, value: string) => `<tipos:${name}>${value}</tipos:${name}>`;

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
  const customerId = customer.length === 14
    ? t('CpfCnpj', t('Cnpj', customer))
    : t('CpfCnpj', t('Cpf', customer));
  const issuedDate = input.issuedAt.slice(0, 10);
  const issRetido = input.issWithholding === '1' ? '2' : '1';
  const responsavelRetencao = input.issWithholding === '2' ? t('ResponsavelRetencao', '1') : input.issWithholding === '3' ? t('ResponsavelRetencao', '2') : '';
  const address = t('Endereco',
    t('Endereco', esc(input.customerAddress.street))
    + t('Numero', esc(input.customerAddress.number))
    + t('Bairro', esc(input.customerAddress.district))
    + t('CodigoMunicipio', customerCity)
    + t('Uf', uf)
    + t('Cep', postalCode));
  const providerId = t('CpfCnpj', t('Cnpj', provider)) + (input.municipalRegistration ? t('InscricaoMunicipal', esc(input.municipalRegistration)) : '');

  return `<tipos:Rps xmlns:tipos="${GISS_TYPES_NAMESPACE}"><tipos:InfDeclaracaoPrestacaoServico Id="RPS${esc(input.number)}">`
    + t('Rps', t('IdentificacaoRps', t('Numero', esc(input.number)) + t('Serie', esc(input.series)) + t('Tipo', '1')) + t('DataEmissao', issuedDate) + t('Status', '1'))
    + t('Competencia', issuedDate)
    + t('Servico', t('Valores', t('ValorServicos', money(input.amount)) + (input.issRate == null ? '' : t('Aliquota', (input.issRate / 100).toFixed(4)))) + t('IssRetido', issRetido) + responsavelRetencao + t('ItemListaServico', item) + t('CodigoNbs', nbs) + t('Discriminacao', esc(input.description)) + t('CodigoMunicipio', input.serviceCityCode) + t('ExigibilidadeISS', input.issExigibility) + t('MunicipioIncidencia', input.serviceCityCode))
    + t('Prestador', providerId)
    + t('TomadorServico', t('IdentificacaoTomador', customerId) + t('RazaoSocial', esc(input.customerName)) + address)
    + t('OptanteSimplesNacional', '2')
    + t('IncentivoFiscal', '2')
    + `</tipos:InfDeclaracaoPrestacaoServico></tipos:Rps>`;
}
