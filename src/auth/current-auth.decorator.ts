import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TaxAgentAuthContext, TaxAgentRequest } from './auth.types';

export const CurrentTaxAgentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TaxAgentAuthContext | undefined => {
    return context.switchToHttp().getRequest<TaxAgentRequest>().taxAgentAuth;
  },
);
