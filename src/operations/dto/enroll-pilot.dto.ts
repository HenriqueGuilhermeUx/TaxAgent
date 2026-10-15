import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class EnrollPilotDto {
  @ApiPropertyOptional({ description: 'Enroll an existing TaxAgent company instead of creating a new one.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  company_id?: string;

  @ApiPropertyOptional({ description: 'Existing organization for a new company.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  organization_id?: string;

  @ApiPropertyOptional({ description: 'Create a new organization when organization_id is not supplied.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  organization_name?: string;

  @ApiPropertyOptional({ example: 'Empresa Piloto LTDA' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  company_name?: string;

  @ApiPropertyOptional({ description: 'CPF/CNPJ. Formatting punctuation is accepted for duplicate detection.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  tax_id?: string;

  @ApiPropertyOptional({ example: '3548500' })
  @IsOptional()
  @IsString()
  @Length(7, 7)
  city_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  municipal_registration?: string;

  @ApiPropertyOptional({ example: 'regular' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  tax_regime?: string;

  @ApiPropertyOptional({ example: 'Piloto Santos 01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pilot_label?: string;

  @ApiPropertyOptional({ example: 'partner-referral', description: 'Operational acquisition source only; never store credentials or secrets here.' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;
}
