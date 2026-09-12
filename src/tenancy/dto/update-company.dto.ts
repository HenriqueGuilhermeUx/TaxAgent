import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Acme Tecnologia LTDA' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: '3550308', description: 'Código IBGE do município emissor.' })
  @IsOptional()
  @IsString()
  @Length(7, 7)
  city_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  municipal_registration?: string;

  @ApiPropertyOptional({ example: 'regular' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tax_regime?: string;
}
