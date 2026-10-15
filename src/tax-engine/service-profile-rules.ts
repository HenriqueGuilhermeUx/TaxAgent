export type ServiceProfile = 'business_consulting';
export type IssWithholding = '1' | '2' | '3';

export interface ServiceProfileInput {
  profile: ServiceProfile;
  issuerCityCode: string;
  destinationCityCode?: string;
  issWithholding?: IssWithholding;
}

export interface MunicipalTaxProfile {
  iss_item: string;
  incidence_city_code: string;
  iss_taxation: '1';
  iss_withholding?: IssWithholding;
  iss_rate: number;
  source: {
    authority: 'official-municipal-domain';
    municipality_code: string;
    url: string;
    rate_table_url: string;
    legal_basis: string[];
    rule: string;
  };
}

export interface ResolvedServiceProfile {
  profile: ServiceProfile;
  classification: {
    national_service_code: string;
    nbs: string;
    cIndOp: string;
    cst: string;
    cClassTrib: string;
    tax_treatment: 'standard';
  };
  municipal_tax?: MunicipalTaxProfile;
  missing: string[];
  sources: Array<Record<string, unknown>>;
}

const NFSE_SERVICE_LIST_URL = 'https://www.gov.br/nfse/pt-br/mei-e-demais-empresas/codigos-de-tributacao-nacional-nbs';
const NFSE_CURRENT_DOCS_URL = 'https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual';
const MOGI_CCM_REFERENCE_URL = 'https://www.mogidascruzes.sp.gov.br/servico/impostos-e-taxas/cadastro-ccm-consulta-ao-cnae-item-da-lei';
const MOGI_ISS_RATE_TABLE_URL = 'https://www.mogidascruzes.sp.gov.br/public/site/doc/201804040846525ac4bb2c9a512.pdf';
const SANTOS_ACTIVITY_REFERENCE_URL = 'https://www.santos.sp.gov.br/?q=node%2F32262';
const LC116_URL = 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm';
const NBS_2_REFERENCE_URL = 'https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/legislacao/documentos-e-arquivos/anexo_i-nbs.pdf';

export function resolveServiceProfile(input: ServiceProfileInput): ResolvedServiceProfile {
  if (input.profile !== 'business_consulting') {
    throw new Error(`Unsupported service profile: ${String(input.profile)}`);
  }

  const missing: string[] = [];
  if (!input.destinationCityCode) missing.push('destination_city_code');

  const sources: Array<Record<string, unknown>> = [
    {
      dataset: 'nfse-national-service-list',
      record_key: '170101',
      authority: 'official-domain',
      url: NFSE_SERVICE_LIST_URL,
      note: '170101 = assessoria ou consultoria de qualquer natureza, não contida em outros itens.',
    },
    {
      dataset: 'nbs-2',
      record_key: '1.1401.19.00',
      authority: 'official-domain',
      url: NBS_2_REFERENCE_URL,
      note: 'NBS 2.0 1.1401.19.00 = serviços de consultoria em gestão empresarial não classificados em subposições anteriores; XML cNBS uses digits-only 114011900.',
    },
    {
      dataset: 'nfse-indop',
      record_key: '100301',
      authority: 'official-domain',
      url: NFSE_CURRENT_DOCS_URL,
      version: 'v1.01-20260122',
      note: 'cIndOp domain comes from the active NFS-e Annex C baseline; profile use remains a vetted TaxAgent rule, not Annex VIII auto-inference.',
    },
  ];

  let municipalTax: MunicipalTaxProfile | undefined;
  if (input.issuerCityCode === '3530607') {
    if (!input.issWithholding) missing.push('iss_withholding');
    municipalTax = {
      iss_item: '17.01',
      incidence_city_code: '3530607',
      iss_taxation: '1',
      iss_withholding: input.issWithholding,
      iss_rate: 4,
      source: {
        authority: 'official-municipal-domain',
        municipality_code: '3530607',
        url: MOGI_CCM_REFERENCE_URL,
        rate_table_url: MOGI_ISS_RATE_TABLE_URL,
        legal_basis: ['LC Municipal 26/2003', 'LC Municipal 134/2017', 'LC Federal 116/2003 art. 3'],
        rule: 'item-17.01',
      },
    };
    sources.push(
      {
        dataset: 'mogi-iss-service-rate',
        record_key: '3530607:17.01',
        authority: 'official-municipal-domain',
        url: MOGI_ISS_RATE_TABLE_URL,
        municipality_code: '3530607',
        iss_item: '17.01',
        iss_rate: 4,
      },
      {
        dataset: 'lc116-iss-incidence',
        record_key: 'art3:17.01',
        authority: 'official-law',
        url: LC116_URL,
        note: 'TaxAgent vetted rule: item 17.01 is not among the art. 3 exceptions, so the general provider-establishment rule applies.',
      },
    );
  } else if (input.issuerCityCode === '3548500') {
    if (!input.issWithholding) missing.push('iss_withholding');
    municipalTax = {
      iss_item: '17.01',
      incidence_city_code: '3548500',
      iss_taxation: '1',
      iss_withholding: input.issWithholding,
      iss_rate: 3,
      source: {
        authority: 'official-municipal-domain',
        municipality_code: '3548500',
        url: SANTOS_ACTIVITY_REFERENCE_URL,
        rate_table_url: SANTOS_ACTIVITY_REFERENCE_URL,
        legal_basis: ['Lei Municipal 3.750/1971 art. 50 §4º', 'LC Federal 116/2003 art. 3'],
        rule: 'item-17.01',
      },
    };
    sources.push(
      {
        dataset: 'santos-iss-service-rate',
        record_key: '3548500:17.01',
        authority: 'official-municipal-domain',
        url: SANTOS_ACTIVITY_REFERENCE_URL,
        municipality_code: '3548500',
        iss_item: '17.01',
        iss_rate: 3,
        note: 'Official Santos activity tables identify item 17.01 activities at 3% ISS, except taxpayers subject to their own Simples Nacional rates.',
      },
      {
        dataset: 'lc116-iss-incidence',
        record_key: 'art3:17.01',
        authority: 'official-law',
        url: LC116_URL,
        note: 'TaxAgent vetted rule: item 17.01 is not among the art. 3 exceptions, so the general provider-establishment rule applies.',
      },
    );
  } else {
    missing.push('municipal_iss_rule');
  }

  return {
    profile: 'business_consulting',
    classification: {
      national_service_code: '170101',
      nbs: '114011900',
      cIndOp: '100301',
      cst: '000',
      cClassTrib: '000001',
      tax_treatment: 'standard',
    },
    municipal_tax: municipalTax,
    missing,
    sources,
  };
}
