import { Injectable } from '@nestjs/common';
import { XMLBuilder } from 'fast-xml-parser';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { CancelFiscalInput } from '../fiscal-core/fiscal.types';
import { FiscalCompany } from './dps-builder.service';

export interface EventBuildResult { xml: string; id: string; verifiedLayout: boolean }

@Injectable()
export class EventBuilderService {
  buildCancellation(input: CancelFiscalInput, company: FiscalCompany): EventBuildResult {
    const eventCode = '101101';
    const accessKey = String(input.accessKey ?? '').trim();
    if (!/^\d{50}$/.test(accessKey)) {
      throw new FiscalEngineError('TA_NFSE_ACCESS_KEY_INVALID', 'National NFS-e cancellation requires a 50-digit access key', false);
    }
    const id = `PRE${accessKey}${eventCode}`;
    const taxIdDigits = String(company.tax_id ?? '').replace(/\D/g, '');
    if (taxIdDigits.length !== 11 && taxIdDigits.length !== 14) {
      throw new FiscalEngineError('TA_EVENT_AUTHOR_TAX_ID_INVALID', 'National NFS-e event author must have a valid CPF/CNPJ-shaped tax identifier', false);
    }
    const taxIdTag = taxIdDigits.length === 11 ? 'CPFAutor' : 'CNPJAutor';
    const dhEvento = this.brazilCivilTimestamp();
    const doc = {
      pedRegEvento: {
        '@_xmlns': 'http://www.sped.fazenda.gov.br/nfse',
        '@_versao': '1.01',
        infPedReg: {
          '@_Id': id,
          tpAmb: input.environment === 'production' ? 1 : 2,
          verAplic: 'TaxAgent_0.12',
          dhEvento,
          [taxIdTag]: taxIdDigits,
          chNFSe: accessKey,
          e101101: { xDesc: 'Cancelamento de NFS-e', cMotivo: input.reasonCode, xMotivo: input.reason },
        },
      },
    };
    const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
    return { xml: `<?xml version="1.0" encoding="UTF-8"?>${builder.build(doc)}`, id, verifiedLayout: false };
  }

  private brazilCivilTimestamp(now = new Date()): string {
    const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    return `${local.toISOString().slice(0, 19)}-03:00`;
  }
}
