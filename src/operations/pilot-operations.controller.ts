import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BootstrapGuard } from '../auth/bootstrap.guard';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { PILOT_OPERATION_STATUSES, PilotOperationStatus, PilotOperationsService } from './pilot-operations.service';

@ApiTags('pilot-operations')
@ApiHeader({ name: 'X-TaxAgent-Bootstrap-Token', required: true })
@UseGuards(BootstrapGuard)
@Controller('operations/pilots')
export class PilotOperationsController {
  constructor(private readonly pilots: PilotOperationsService) {}

  @Get()
  @ApiOperation({ summary: 'List the cross-company fiscal pilot operations queue from persisted evidence only; never contacts providers or transmits fiscal data' })
  @ApiQuery({ name: 'environment', required: false, enum: ['test', 'production'], example: 'test' })
  @ApiQuery({ name: 'organization_id', required: false })
  @ApiQuery({ name: 'status', required: false, enum: PILOT_OPERATION_STATUSES })
  @ApiQuery({ name: 'route', required: false })
  @ApiQuery({ name: 'provider', required: false })
  @ApiQuery({ name: 'blocker', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Search company name, tax ID or city code' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  list(
    @Query('environment') rawEnvironment?: string,
    @Query('organization_id') organizationId?: string,
    @Query('status') rawStatus?: string,
    @Query('route') route?: string,
    @Query('provider') provider?: string,
    @Query('blocker') blocker?: string,
    @Query('q') q?: string,
    @Query('limit') rawLimit?: string,
    @Query('offset') rawOffset?: string,
  ) {
    const environment = this.environment(rawEnvironment ?? 'test');
    const status = this.status(rawStatus);
    const limit = this.integer(rawLimit, 50, 1, 200, 'limit');
    const offset = this.integer(rawOffset, 0, 0, 100000, 'offset');
    for (const [name, value] of Object.entries({ organizationId, route, provider, blocker, q })) {
      if (value && value.length > 120) throw new BadRequestException(`${name} is too long`);
    }
    return this.pilots.list({
      environment,
      organizationId: clean(organizationId),
      status,
      route: clean(route),
      provider: clean(provider),
      blocker: clean(blocker),
      q: clean(q),
      limit,
      offset,
    });
  }

  private environment(value: string): FiscalEnvironment {
    if (value !== 'test' && value !== 'production') throw new BadRequestException('environment must be test or production');
    return value;
  }

  private status(value: string | undefined): PilotOperationStatus | undefined {
    if (!value) return undefined;
    if (!PILOT_OPERATION_STATUSES.includes(value as PilotOperationStatus)) {
      throw new BadRequestException(`status must be one of: ${PILOT_OPERATION_STATUSES.join(', ')}`);
    }
    return value as PilotOperationStatus;
  }

  private integer(raw: string | undefined, fallback: number, min: number, max: number, name: string): number {
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new BadRequestException(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  }
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
