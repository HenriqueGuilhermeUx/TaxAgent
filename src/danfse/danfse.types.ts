export interface DanfseParty {
  taxId?: string;
  municipalRegistration?: string;
  phone?: string;
  name?: string;
  municipality?: string;
  uf?: string;
  cityCode?: string;
  cep?: string;
  address?: string;
  email?: string;
  simpleNational?: string;
  simpleRegime?: string;
}

export interface DanfseModel {
  specVersion: 'NT008-1.02';
  environment: 'production' | 'test';
  accessKey?: string;
  number?: string;
  competence?: string;
  issuedAt?: string;
  dpsNumber?: string;
  dpsSeries?: string;
  dpsIssuedAt?: string;
  issuer?: string;
  status?: string;
  purpose?: string;
  issuerMunicipality?: string;
  issuerUf?: string;
  generator?: string;
  provider: DanfseParty;
  customer: DanfseParty;
  recipient: DanfseParty;
  intermediary: DanfseParty;
  service: {
    nationalCode?: string;
    municipalCode?: string;
    nbs?: string;
    location?: string;
    codeDescription?: string;
    description?: string;
  };
  iss: Record<string, string | undefined>;
  federal: Record<string, string | undefined>;
  ibsCbs: Record<string, string | undefined>;
  totals: Record<string, string | undefined>;
  complementary?: string;
}
