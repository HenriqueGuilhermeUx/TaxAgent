import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TaxAgentAuthContext } from '../auth/auth.types';
import { CurrentTaxAgentAuth } from '../auth/current-auth.decorator';
import { RequireScope } from '../auth/require-scope.decorator';
import { CustomerIssWithholdingDefault, CustomersService } from './customers.service';

class SaveCustomerDto {
  @IsString() @IsNotEmpty() @MaxLength(32) tax_id!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsString() @Length(7, 7) city_code!: string;
}

class SaveFiscalDefaultDto {
  @IsString() @IsNotEmpty() @MaxLength(80) service_profile!: string;
  @IsIn(['not_withheld', 'customer', 'intermediary']) iss_withholding!: CustomerIssWithholdingDefault;
}

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequireScope('invoices:read')
  @ApiQuery({ name: 'q', required: false })
  @ApiOperation({ summary: 'List/search customers saved for the authenticated company' })
  list(@Query('q') q: string | undefined, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('Authenticated API key required');
    return this.customers.list(auth.companyId, q);
  }

  @Post()
  @RequireScope('invoices:write')
  @ApiOperation({ summary: 'Create or update a customer by tax ID for the authenticated company' })
  save(@Body() dto: SaveCustomerDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('Authenticated API key required');
    return this.customers.upsertFromOperation(auth.companyId, dto);
  }

  @Post(':id/fiscal-memory')
  @RequireScope('invoices:write')
  @ApiOperation({ summary: 'Explicitly remember an ISS withholding default for this customer and service profile' })
  remember(@Param('id') id: string, @Body() dto: SaveFiscalDefaultDto, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('Authenticated API key required');
    return this.customers.rememberFiscalDefault(auth.companyId, id, dto.service_profile, dto.iss_withholding);
  }

  @Delete(':id/fiscal-memory/:serviceProfile')
  @RequireScope('invoices:write')
  @ApiOperation({ summary: 'Forget a customer fiscal default; future operations will ask again when needed' })
  forget(@Param('id') id: string, @Param('serviceProfile') serviceProfile: string, @CurrentTaxAgentAuth() auth?: TaxAgentAuthContext) {
    if (!auth) throw new ForbiddenException('Authenticated API key required');
    return this.customers.clearFiscalDefault(auth.companyId, id, serviceProfile);
  }
}
