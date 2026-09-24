import { Injectable, Optional } from '@nestjs/common';
import { XMLBuilder } from 'fast-xml-parser';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { CancelFiscalInput } from '../fiscal-core/fiscal.types';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';
import { FiscalCompany } from './dps-builder.service';

export interface EventBuildResult { xml: string; id: string; verifiedLayout: boolean }

@Injectable()
export class EventBuilderService {
  constructor(@Optional() private readonly schemas?: SchemaRegistryService) {}

  buildCancellation(input: CancelFiscalInput, company: FiscalCompany): EventBuildResult {
    const eventCode = '101101';
    const reasonCode = String(input.reasonCode ?? '').trim();
    if (!['1', '2', '9'].includes(reasonCode)) {
      throw new FiscalEngineError(
        'TA_NFSE_CANCELLATION_REASON_INVALID',
        'National NFS-e cancellation reason code must be one of the active e101101 values: 1, 2 or 9',
        false,
      );
    }

    const accessKey = String(input.accessKey ?? '').trim().toUpperCase();
    if (!/^[0-9]{8}(?:1[0-9]{14}|2[0-9A-Z]{14})[0-9]{27}$/.test(accessKey)) {
      throw new FiscalEngineError(
        'TA_NFSE_ACCESS_KEY_INVALID',
        'National NFS-e cancellation requires an access key matching the active 50-position national key structure',
        false,
      );
    }

    const taxId = String(company.tax_id ?? '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    const isCpf = /^[0-9]{11}$/.test(taxId);
    const isCnpj = /^[0-9A-Z]{14}$/.test(taxId);
    if (!isCpf && !isCnpj) {
      throw new FiscalEngineError('TA_EVENT_AUTHOR_TAX_ID_INVALID', 'National NFS-e event author must have a valid CPF/CNPJ-shaped tax identifier', false);
    }

    const keyFederalType = accessKey[8];
    const keyFederalId = accessKey.slice(9, 23);
    const expectedFederalType = isCpf ? '1' : '2';
    const expectedFederalId = isCpf ? taxId.padStart(14, '0') : taxId;
    if (keyFederalType !== expectedFederalType || keyFederalId !== expectedFederalId) {
      throw new FiscalEngineError(
        'TA_NFSE_ACCESS_KEY_COMPANY_MISMATCH',
        'National NFS-e access key does not belong to the Company federal tax identifier; cancellation is blocked',
        false,
      );
    }

    const id = `PRE${accessKey}${eventCode}`;
    const taxIdTag = isCpf ? 'CPFAutor' : 'CNPJAutor';
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
          [taxIdTag]: taxId,
          chNFSe: accessKey,
          e101101: { xDesc: 'Cancelamento de NFS-e', cMotivo: reasonCode, xMotivo: input.reason },
        },
      },
    };
    const builder = new XMLBuilder({ ignoreAttributes: false, format: false });
    const conformance = this.schemas?.eventConformance(input.environment);
    return {
      xml: `<?xml version="1.0" encoding="UTF-8"?>${builder.build(doc)}`,
      id,
      verifiedLayout: conformance?.verified === true,
    };
  }

  private brazilCivilTimestamp(now = new Date()): string {
    const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    return `${local.toISOString().slice(0, 19)}-03:00`;
  }
}
