import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, Max, Min } from 'class-validator';

export class PublicRtc2026SimulationDto {
  @ApiProperty({ example: 10000, description: 'Operation amount. No taxpayer/customer data is accepted by this public simulator.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000000)
  amount!: number;

  @ApiProperty({ example: '2026-11-19', description: 'Effective date. This public reference simulator is limited to 2026.' })
  @IsDateString()
  effective_date!: string;

  @ApiProperty({ enum: ['standard', 'differentiated', 'special', 'unknown'], example: 'standard' })
  @IsIn(['standard', 'differentiated', 'special', 'unknown'])
  tax_treatment!: 'standard' | 'differentiated' | 'special' | 'unknown';
}
