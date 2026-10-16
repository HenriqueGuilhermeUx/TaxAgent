import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BootstrapGuard } from '../auth/bootstrap.guard';
import { GrantFiscalTransmissionPermitDto, RevokeFiscalTransmissionPermitDto } from './dto/transmission-permit.dto';
import { FiscalTransmissionPermitService } from './fiscal-transmission-permit.service';

@ApiTags('operations')
@Controller('operations/transmission-permits')
@UseGuards(BootstrapGuard)
export class FiscalTransmissionPermitController {
  constructor(private readonly permits:FiscalTransmissionPermitService){}

  @Post()
  @ApiOperation({summary:'Grant one short-lived TEST transmission authorization bound to a signed Prepared DPS'})
  grant(@Body() body:GrantFiscalTransmissionPermitDto){return this.permits.grant(body);}

  @Get()
  @ApiOperation({summary:'List safe transmission-permit metadata for one Company'})
  @ApiQuery({name:'company_id',required:true})
  @ApiQuery({name:'environment',required:false,enum:['test']})
  list(@Query('company_id') companyId:string,@Query('environment') environment?:string){
    return this.permits.list(companyId,environment??'test');
  }

  @Post(':id/revoke')
  @ApiOperation({summary:'Revoke an unused TEST transmission permit'})
  revoke(@Param('id') id:string,@Body() body:RevokeFiscalTransmissionPermitDto){
    return this.permits.revoke(id,body.reason);
  }
}
