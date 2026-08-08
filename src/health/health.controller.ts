import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'taxagent-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    };
  }
}
