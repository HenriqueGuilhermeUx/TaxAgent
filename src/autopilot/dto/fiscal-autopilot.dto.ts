import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length, MaxLength, ValidateNested } from 'class-validator';

export class AutopilotCustomerDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(32) tax_id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiProperty({ example: '3550308' }) @IsString() @Length(7, 7) city_code!: string;
}

class AutopilotServiceDto {
  @ApiProperty({ example: 'Serviços de consultoria empresarial' }) @IsString() @IsNotEmpty() @MaxLength(2000) description!: string;
  @ApiProperty({ example: 5000 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
}

export class CreateFiscalAutopilotDto {
  @ApiProperty() @IsString() @IsNotEmpty() company_id!: string;
  @ApiProperty({ enum: ['test', 'production'], default: 'test' }) @IsIn(['test', 'production']) environment!: 'test' | 'production';
  @ApiPropertyOptional({ example: '2026-08-15', description: 'Competência. Se omitida no perfil inicial de Mogi, o Autopilot usa a data local America/Sao_Paulo.' }) @IsOptional() @IsDateString({ strict: true }) competence?: string;
  @ApiPropertyOptional({ example: '2026-08-15', description: 'Data efetiva da decisão fiscal. Se omitida, usa competence ou a data local do perfil municipal.' }) @IsOptional() @IsDateString({ strict: true }) effective_at?: string;
  @ApiPropertyOptional({ description: 'Cliente já salvo. Quando informado, o TaxAgent recupera CNPJ/nome/município e congela um snapshot no Fiscal Intent.' }) @IsOptional() @IsString() @IsNotEmpty() customer_id?: string;
  @ApiPropertyOptional({ type: AutopilotCustomerDto, description: 'Novo cliente ou atualização cadastral. O TaxAgent salva automaticamente para reutilização.' }) @IsOptional() @ValidateNested() @Type(() => AutopilotCustomerDto) customer?: AutopilotCustomerDto;
  @ApiProperty({ type: AutopilotServiceDto }) @ValidateNested() @Type(() => AutopilotServiceDto) service!: AutopilotServiceDto;
  @ApiPropertyOptional({ enum: ['not_withheld', 'customer', 'intermediary'], description: 'Resposta humana sobre retenção do ISS; o Autopilot converte para tpRetISSQN.' })
  @IsOptional() @IsIn(['not_withheld', 'customer', 'intermediary']) iss_withholding?: 'not_withheld' | 'customer' | 'intermediary';
  @ApiPropertyOptional({ description: 'Quando true, salva a retenção escolhida como padrão explícito para este cliente + perfil de serviço.' })
  @IsOptional() @IsBoolean() remember_iss_withholding?: boolean;
}

export class AnswerFiscalAutopilotDto {
  @ApiPropertyOptional({ enum: ['business_consulting', 'other'], description: 'Confirmação humana quando a descrição não permite classificação segura.' })
  @IsOptional() @IsIn(['business_consulting', 'other']) service_kind?: 'business_consulting' | 'other';
  @ApiPropertyOptional({ enum: ['not_withheld', 'customer', 'intermediary'] })
  @IsOptional() @IsIn(['not_withheld', 'customer', 'intermediary']) iss_withholding?: 'not_withheld' | 'customer' | 'intermediary';
  @ApiPropertyOptional({ description: 'Salva esta resposta como padrão explícito para o cliente + perfil de serviço.' })
  @IsOptional() @IsBoolean() remember_iss_withholding?: boolean;
}
