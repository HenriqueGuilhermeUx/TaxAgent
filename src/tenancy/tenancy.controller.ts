import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { TenancyService } from './tenancy.service';

@ApiTags('tenancy')
@Controller()
export class TenancyController {
  constructor(private readonly tenancy: TenancyService) {}

  @Post('organizations')
  createOrganization(@Body() dto: CreateOrganizationDto) {
    return this.tenancy.createOrganization(dto.name);
  }

  @Post('organizations/:organizationId/companies')
  createCompany(@Param('organizationId') organizationId: string, @Body() dto: CreateCompanyDto) {
    return this.tenancy.createCompany(organizationId, dto);
  }

  @Get('companies/:id')
  getCompany(@Param('id') id: string) {
    return this.tenancy.getCompany(id);
  }
}
