import { SetMetadata } from '@nestjs/common';

export const TAXAGENT_SCOPES = 'taxagent:required-scopes';
export const RequireScope = (...scopes: string[]) => SetMetadata(TAXAGENT_SCOPES, scopes);
