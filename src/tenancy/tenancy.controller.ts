import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { BootstrapGuard } from '../auth/bootstrap.guard';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { TenancyService } from './tenancy.service';

@ApiTags('tenancy')
@Controller()
export class TenancyController {
  constructor(private readonly tenancy: TenancyService) {}

  @Post('organizations')
  @ApiHeader({ name: 'X-TaxAgent-Bootstrap-Token', required: true })
  @UseGuards(BootstrapGuard)
  createOrganization(@Body() dto: CreateOrganizationDto) {
    return this.tenancy.createOrganization(dto.name);
  }

  @Post('organizations/:organizationId/companies')
  @ApiHeader({ name: 'X-TaxAgent-Bootstrap-Token', required: true })
  @UseGuards(BootstrapGuard)
  createCompany(@Param('organizationId') organizationId: string, @Body() dto: CreateCompanyDto) {
    return this.tenancy.createCompany(organizationId, dto);
  }

  @Patch('companies/:id')
  @ApiHeader({ name: 'X-TaxAgent-Bootstrap-Token', required: true })
  @UseGuards(BootstrapGuard)
  updateCompany(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.tenancy.updateCompany(id, dto);
  }

  @Get('companies/:id')
  @ApiHeader({ name: 'X-TaxAgent-Bootstrap-Token', required: true })
  @UseGuards(BootstrapGuard)
  getCompany(@Param('id') id: string) {
    return this.tenancy.getCompany(id);
  }
}
