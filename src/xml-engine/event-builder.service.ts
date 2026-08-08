import { Injectable } from '@nestjs/common';
import { XMLBuilder } from 'fast-xml-parser';
import { CancelFiscalInput } from '../fiscal-core/fiscal.types';
import { FiscalCompany } from './dps-builder.service';

export interface EventBuildResult { xml: string; id: string; verifiedLayout: boolean }

@Injectable()
export class EventBuilderService {
  buildCancellation(input: CancelFiscalInput, company: FiscalCompany): EventBuildResult {
    const sequence = '001';
    const eventCode = '101101';
    const id = `PRE${input.accessKey}${eventCode}${sequence}`;
    const taxIdTag = company.tax_id.replace(/\D/g, '').length === 11 ? 'CPFAutor' : 'CNPJAutor';
    const local = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');
    const doc = {
      pedRegEvento: {
        '@_xmlns': 'http://www.sped.fazenda.gov.br/nfse',
        '@_versao': '1.00',
        infPedReg: {
          '@_Id': id,
          tpAmb: input.environment === 'production' ? 1 : 2,
          verAplic: 'TaxAgent_0.6',
          dhEvento: local,
          [taxIdTag]: company.tax_id,
          chNFSe: input.accessKey,
          nPedRegEvento: sequence,
          e101101: { xDesc: 'Cancelamento de NFS-e', cMotivo: input.reasonCode, xMotivo: input.reason },
        },
      },
    };
    const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
    return { xml: `<?xml version="1.0" encoding="UTF-8"?>${builder.build(doc)}`, id, verifiedLayout: process.env.TAXAGENT_EVENT_BUILDER_MODE === 'verified' };
  }
}
