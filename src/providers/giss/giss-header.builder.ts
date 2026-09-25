import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export const GISS_ABRASF_VERSION = '2.04' as const;
export const GISS_HEADER_NAMESPACE = 'http://www.giss.com.br/cabecalho-v2_04.xsd' as const;
export const GISS_TYPES_NAMESPACE = 'http://www.giss.com.br/tipos-v2_04.xsd' as const;

export function buildGissCabecalho(version: string = GISS_ABRASF_VERSION): string {
  if (version !== GISS_ABRASF_VERSION) {
    throw new FiscalEngineError(
      'TA_GISS_LAYOUT_VERSION_UNVERIFIED',
      `Only verified GISS ABRASF layout ${GISS_ABRASF_VERSION} is enabled`,
      false,
      { requested_version: version, transmission_attempted: false },
    );
  }
  return `<cabecalho xmlns="${GISS_HEADER_NAMESPACE}" xmlns:tipos="${GISS_TYPES_NAMESPACE}" versao="${version}"><versaoDados>${version}</versaoDados></cabecalho>`;
}
