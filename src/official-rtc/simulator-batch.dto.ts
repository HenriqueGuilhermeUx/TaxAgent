import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, ValidateNested } from 'class-validator';
import { CanonicalRegularCalculationDto, CanonicalSimplesCalculationDto } from './canonical-rtc.dto';

export class RegularSimulatorBatchDto {
  @ApiProperty({ enum: ['validate', 'calculate'], default: 'validate' })
  @IsIn(['validate', 'calculate'])
  execution!: 'validate' | 'calculate';

  @ApiProperty({ type: [CanonicalRegularCalculationDto], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CanonicalRegularCalculationDto)
  rows!: CanonicalRegularCalculationDto[];
}

export class SimplesSimulatorBatchDto {
  @ApiProperty({ enum: ['validate', 'calculate'], default: 'validate' })
  @IsIn(['validate', 'calculate'])
  execution!: 'validate' | 'calculate';

  @ApiProperty({ type: [CanonicalSimplesCalculationDto], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CanonicalSimplesCalculationDto)
  rows!: CanonicalSimplesCalculationDto[];
}
