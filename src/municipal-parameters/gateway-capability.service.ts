import { Injectable } from '@nestjs/common';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { PlugNotasClient } from '../providers/plugnotas/plugnotas.client';

@Injectable()
export class GatewayCapabilityService {
  constructor(private readonly plugnotas: PlugNotasClient) {}

  async resolve(cityCode: string, environment: FiscalEnvironment) {
    if (!this.plugnotas.isConfigured(environment)) {
      return {
        cityCode,
        environment,
        provider: 'plugnotas',
        configured: false,
        covered: false,
        transmissionEnabled: false,
        reason: 'gateway_not_configured',
      };
    }

    const metadata = await this.plugnotas.getMunicipality(environment, cityCode);
    if (!metadata) {
      return {
        cityCode,
        environment,
        provider: 'plugnotas',
        configured: true,
        covered: false,
        transmissionEnabled: false,
        reason: 'municipality_not_listed_by_gateway',
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      cityCode,
      environment,
      provider: 'plugnotas',
      configured: true,
      covered: true,
      transmissionEnabled: false,
      municipality: {
        id: metadata.id,
        name: metadata.nome,
        state: metadata.uf,
        pattern: metadata.padrao ?? null,
      },
      requirements: {
        certificate: metadata.certificado ?? null,
        login: metadata.login ?? null,
        password: metadata.senha ?? null,
        certificateUpload: metadata.upload ?? null,
        sequentialNumbering: metadata.sequencial ?? null,
        substitution: metadata.substituicao ?? null,
      },
      nationalPattern: {
        production: metadata.padraoNacional?.producao ?? null,
        test: metadata.padraoNacional?.homologacao ?? null,
      },
      evidence: {
        source: 'plugnotas-municipality-api',
        endpoint: `/nfse/cidades/${cityCode}`,
        checkedAt: new Date().toISOString(),
      },
      safeguards: {
        capability_lookup_only: true,
        fiscal_transmission_attempted: false,
      },
    };
  }
}
