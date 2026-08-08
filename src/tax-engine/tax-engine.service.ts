import { BadRequestException, Injectable } from '@nestjs/common';
import { CanonicalInvoiceInput } from '../fiscal-core/fiscal.types';

@Injectable()
export class TaxEngineService {
  validate(input: CanonicalInvoiceInput): CanonicalInvoiceInput {
    if (!Number.isFinite(input.service.amount) || input.service.amount <= 0) {
      throw new BadRequestException('service.amount must be greater than zero');
    }

    return input;
  }
}
