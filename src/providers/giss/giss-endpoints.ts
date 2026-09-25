export interface GissEndpointConfig { citySlug: string; productionWsdl: string; homologationWsdl: string; protocol: 'soap'; layout: 'abrasf-2.04'; source: string }

const CITY_SLUGS: Record<string, string> = { '3548500': 'santos' };

export function gissEndpointPolicy(cityCode: string): GissEndpointConfig | null {
  const citySlug = CITY_SLUGS[cityCode];
  if (!citySlug) return null;
  return {
    citySlug,
    productionWsdl: `https://ws-${citySlug}.giss.com.br/service-ws/nf/nfse-ws?wsdl`,
    homologationWsdl: 'https://ws-homologacao-rtc.giss.com.br/service-ws/nf/nfse-ws?wsdl',
    protocol: 'soap',
    layout: 'abrasf-2.04',
    source: 'GissOnline Manual Tecnico Servicos Prestados V1.6 + 2026 RTC homologation endpoint evidence + Santos municipal GISS/NFS-e portal',
  };
}
