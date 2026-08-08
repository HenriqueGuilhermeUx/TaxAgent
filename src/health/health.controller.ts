import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  async getHealth() {
    try {
      await this.db.ping();
      return {
        status: 'ok',
        service: 'taxagent-api',
        version: '0.4.0',
        database: 'ok',
        nfse_mode: process.env.TAXAGENT_NFSE_MODE ?? 'mock',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', service: 'taxagent-api', database: 'unavailable', timestamp: new Date().toISOString() });
    }
  }
}
