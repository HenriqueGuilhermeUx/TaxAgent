export interface TaxAgentAuthContext {
  keyId: string;
  companyId: string;
  environment: 'test' | 'production';
  scopes: string[];
}

export interface TaxAgentRequest {
  headers: Record<string, string | string[] | undefined>;
  taxAgentAuth?: TaxAgentAuthContext;
}
