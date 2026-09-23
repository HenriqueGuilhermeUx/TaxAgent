import { FiscalEngineError } from '../../fiscal-core/fiscal-engine.error';

export const GISS_ABRASF_VERSION = '2.04' as const;

export function buildGissCabecalho(version: string = GISS_ABRASF_VERSION): string {
  if (version !== GISS_ABRASF_VERSION) {
    throw new FiscalEngineError(
      'TA_GISS_LAYOUT_VERSION_UNVERIFIED',
      `Only verified GISS ABRASF layout ${GISS_ABRASF_VERSION} is enabled`,
      false,
      { requested_version: version, transmission_attempted: false },
    );
  }
  return `<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="${version}"><versaoDados>${version}</versaoDados></cabecalho>`;
}
