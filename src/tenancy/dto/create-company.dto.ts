import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Tecnologia LTDA' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'CPF/CNPJ as string; supports future alphanumeric identifiers.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  tax_id!: string;

  @ApiProperty({ example: '3550308' })
  @IsString()
  @Length(7, 7)
  city_code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  municipal_registration?: string;

  @ApiPropertyOptional({ example: 'regular' })
  @IsOptional()
  @IsString()
  tax_regime?: string;
}
