import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

class CustomerDto {
  @ApiProperty() @IsString() @IsNotEmpty() tax_id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty({ example: '3550308' })
  @IsString()
  @Length(7, 7)
  city_code!: string;
}

class ServiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() description!: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  national_service_code?: string;
}

export class CreateInvoiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() company_id!: string;

  @ApiPropertyOptional({ enum: ['test', 'production'], default: 'test' })
  @IsOptional()
  @IsIn(['test', 'production'])
  environment: 'test' | 'production' = 'test';

  @ApiProperty({ type: CustomerDto })
  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;

  @ApiProperty({ type: ServiceDto })
  @ValidateNested()
  @Type(() => ServiceDto)
  service!: ServiceDto;
}
