import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export interface AbrasfRpsInput {
  number: string;
  series: string;
  issuedAt: string;
  providerTaxId: string;
  municipalRegistration?: string | null;
  customerTaxId: string;
  customerName: string;
  serviceCode: string;
  description: string;
  amount: number;
  issRate?: number;
  serviceCityCode: string;
}

const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const money = (value: number) => value.toFixed(2);
const digits = (value: string) => value.replace(/\D/g, '');

export function buildAbrasfRps(input: AbrasfRpsInput): string {
  const provider = digits(input.providerTaxId);
  const customer = digits(input.customerTaxId);
  if (provider.length !== 14) throw new FiscalEngineError('TA_GISS_PROVIDER_CNPJ_INVALID', 'GISS RPS requires a 14-digit provider CNPJ', false);
  if (![11, 14].includes(customer.length)) throw new FiscalEngineError('TA_GISS_CUSTOMER_TAX_ID_INVALID', 'GISS RPS customer tax id must be CPF or CNPJ', false);
  if (!/^\d{7}$/.test(input.serviceCityCode)) throw new FiscalEngineError('TA_GISS_CITY_CODE_INVALID', 'GISS RPS requires a 7-digit municipality code', false);
  const customerId = customer.length === 14 ? `<CpfCnpj><Cnpj>${customer}</Cnpj></CpfCnpj>` : `<CpfCnpj><Cpf>${customer}</Cpf></CpfCnpj>`;
  return `<Rps><InfDeclaracaoPrestacaoServico Id="RPS${esc(input.number)}"><Rps><IdentificacaoRps><Numero>${esc(input.number)}</Numero><Serie>${esc(input.series)}</Serie><Tipo>1</Tipo></IdentificacaoRps><DataEmissao>${esc(input.issuedAt)}</DataEmissao><Status>1</Status></Rps><Competencia>${esc(input.issuedAt.slice(0,10))}</Competencia><Servico><Valores><ValorServicos>${money(input.amount)}</ValorServicos>${input.issRate == null ? '' : `<Aliquota>${(input.issRate / 100).toFixed(4)}</Aliquota>`}</Valores><IssRetido>2</IssRetido><ItemListaServico>${esc(input.serviceCode)}</ItemListaServico><Discriminacao>${esc(input.description)}</Discriminacao><CodigoMunicipio>${input.serviceCityCode}</CodigoMunicipio></Servico><Prestador><CpfCnpj><Cnpj>${provider}</Cnpj></CpfCnpj>${input.municipalRegistration ? `<InscricaoMunicipal>${esc(input.municipalRegistration)}</InscricaoMunicipal>` : ''}</Prestador><Tomador><IdentificacaoTomador>${customerId}</IdentificacaoTomador><RazaoSocial>${esc(input.customerName)}</RazaoSocial></Tomador><OptanteSimplesNacional>2</OptanteSimplesNacional><IncentivoFiscal>2</IncentivoFiscal></InfDeclaracaoPrestacaoServico></Rps>`;
}
