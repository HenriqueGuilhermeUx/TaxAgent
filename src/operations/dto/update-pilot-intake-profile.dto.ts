import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdatePilotIntakeProfileDto {
  @ApiPropertyOptional({ example: '3548500', description: 'Código IBGE real do município emissor. Dados secretos não são aceitos neste endpoint.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/)
  city_code?: string;

  @ApiPropertyOptional({ example: '123456', description: 'Inscrição Municipal/CCM real da empresa, quando aplicável.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  municipal_registration?: string;

  @ApiPropertyOptional({ example: 'regular', description: 'Regime tributário real da empresa.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  tax_regime?: string;
}
