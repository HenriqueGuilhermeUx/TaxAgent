import { Injectable } from '@nestjs/common';
import { XMLBuilder } from 'fast-xml-parser';
import { CanonicalInvoiceInput } from '../fiscal-core/fiscal.types';
import { DpsSequenceService } from './dps-sequence.service';

export interface FiscalCompany {
  id: string;
  tax_id: string;
  municipal_registration: string | null;
  city_code: string;
}

export interface DpsBuildResult {
  xml: string;
  id: string;
  sequence: number;
  series: string;
  verifiedLayout: boolean;
}

@Injectable()
export class DpsBuilderService {
  constructor(private readonly sequences: DpsSequenceService) {}

  async build(input: CanonicalInvoiceInput, company: FiscalCompany): Promise<DpsBuildResult> {
    const sequence = await this.sequences.next(input.companyId, input.environment);
    const series = process.env.TAXAGENT_DPS_SERIES ?? '1';
    const id = `DPS${company.city_code}${String(sequence).padStart(15, '0')}`;
    const verifiedLayout = process.env.TAXAGENT_DPS_BUILDER_MODE === 'verified';

    const doc = {
      DPS: {
        '@_xmlns': 'http://www.sped.fazenda.gov.br/nfse',
        '@_versao': '1.01',
        infDPS: {
          '@_Id': id,
          tpAmb: input.environment === 'production' ? 1 : 2,
          dhEmi: new Date().toISOString(),
          verAplic: 'TaxAgent_0.3',
          serie: series,
          nDPS: sequence,
          dCompet: new Date().toISOString().slice(0, 10),
          tpEmit: 1,
          cLocEmi: company.city_code,
          prest: {
            CNPJ: company.tax_id,
            ...(company.municipal_registration ? { IM: company.municipal_registration } : {}),
          },
          toma: {
            CNPJ: input.customer.taxId,
            xNome: input.customer.name,
          },
          serv: {
            locPrest: { cLocPrestacao: input.customer.cityCode },
            cServ: {
              cTribNac: input.service.nationalServiceCode,
              xDescServ: input.service.description,
            },
          },
          valores: {
            vServPrest: { vServ: input.service.amount.toFixed(2) },
          },
          ...(input.service.operationIndicator || input.service.taxClassification
            ? {
                IBSCBS: {
                  ...(input.service.operationIndicator ? { cIndOp: input.service.operationIndicator } : {}),
                  ...(input.service.taxClassification ? { cClassTrib: input.service.taxClassification } : {}),
                },
              }
            : {}),
        },
      },
    };

    const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
    return {
      xml: `<?xml version="1.0" encoding="UTF-8"?>${builder.build(doc)}`,
      id,
      sequence,
      series,
      verifiedLayout,
    };
  }
}
