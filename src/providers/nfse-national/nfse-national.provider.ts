import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { FiscalProvider } from '../../fiscal-core/fiscal-provider.interface';
import {
  CanonicalInvoiceInput,
  FiscalContext,
  IssueResult,
} from '../../fiscal-core/fiscal.types';

@Injectable()
export class NfseNationalProvider implements FiscalProvider {
  readonly name = 'nfse-national';

  async canHandle(_context: FiscalContext): Promise<boolean> {
    return true;
  }

  async issue(input: CanonicalInvoiceInput): Promise<IssueResult> {
    const mode = process.env.TAXAGENT_NFSE_MODE ?? 'mock';

    if (mode !== 'mock') {
      throw new Error(
        'Live NFS-e National transmission is intentionally disabled until DPS signing, XSD validation and certificate mTLS are implemented.',
      );
    }

    return {
      status: 'authorized',
      provider: this.name,
      accessKey: `MOCK-${randomUUID().replaceAll('-', '').toUpperCase()}`,
      providerReference: `dps_mock_${Date.now()}`,
      raw: {
        mode,
        companyId: input.companyId,
        amount: input.service.amount,
      },
    };
  }
}
