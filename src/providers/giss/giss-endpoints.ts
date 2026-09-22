export interface GissEndpointConfig { citySlug: string; wsdl: string; protocol: 'soap'; layout: 'abrasf-2.03-2.04' }

const CITY_SLUGS: Record<string, string> = { '3548500': 'santos' };

export function gissEndpointPolicy(cityCode: string): GissEndpointConfig | null {
  const citySlug = CITY_SLUGS[cityCode];
  if (!citySlug) return null;
  return {
    citySlug,
    wsdl: `https://ws-${citySlug}.giss.com.br/service-ws/nf/nfse-ws?wsdl`,
    protocol: 'soap',
    layout: 'abrasf-2.03-2.04',
  };
}
