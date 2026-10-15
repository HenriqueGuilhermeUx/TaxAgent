import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BootstrapGuard } from '../auth/bootstrap.guard';
import { CommercialPilotService } from './commercial-pilot.service';
import { CreatePilotApplicationDto, UpdatePilotApplicationStatusDto } from './dto/commercial-pilot.dto';

@ApiTags('commercial')
@Controller('commercial/pilot-applications')
export class CommercialPilotController {
  constructor(private readonly pilots: CommercialPilotService) {}

  @Post() @HttpCode(202)
  @ApiOperation({ summary: 'Request access to the controlled TaxAgent fiscal pilot' })
  create(@Body() dto: CreatePilotApplicationDto) { return this.pilots.create(dto); }

  @Get() @UseGuards(BootstrapGuard)
  @ApiOperation({ summary: 'List commercial pilot applications (management plane)' })
  @ApiQuery({ name:'status', required:false }) @ApiQuery({ name:'limit', required:false })
  list(@Query('status') status?:string,@Query('limit') limit?:string) { return this.pilots.list(status,Number(limit??100)); }

  @Post(':id/status') @UseGuards(BootstrapGuard)
  @ApiOperation({ summary: 'Update commercial pilot application status (management plane)' })
  update(@Param('id') id:string,@Body() dto:UpdatePilotApplicationStatusDto) { return this.pilots.update(id,dto); }
}