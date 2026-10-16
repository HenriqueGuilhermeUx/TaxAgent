import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreatePilotApplicationDto {
  @ApiProperty({ example: 'Maria Silva' }) @IsString() @IsNotEmpty() @MaxLength(160) contact_name!: string;
  @ApiProperty({ example: 'maria@empresa.com.br' }) @IsEmail() @MaxLength(240) email!: string;
  @ApiPropertyOptional({ example: '(11) 99999-9999' }) @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiProperty({ example: 'Empresa ABC Ltda' }) @IsString() @IsNotEmpty() @MaxLength(200) company_name!: string;
  @ApiPropertyOptional({ example: '12.345.678/0001-90' }) @IsOptional() @IsString() @MaxLength(32) tax_id?: string;
  @ApiProperty({ enum: ['company','accounting_office','software'] }) @IsIn(['company','accounting_office','software']) profile!: 'company'|'accounting_office'|'software';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1200) message?: string;
  @ApiProperty({ example: true }) @Equals(true) consent!: true;
}

export class UpdatePilotApplicationStatusDto {
  @ApiProperty({ enum: ['new','contacted','qualified','accepted','rejected'] }) @IsIn(['new','contacted','qualified','accepted','rejected']) status!: 'new'|'contacted'|'qualified'|'accepted'|'rejected';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1200) note?: string;
}

export class ConvertPilotApplicationDto {
  @ApiPropertyOptional({ description: 'Required only when the application did not provide a CNPJ/CPF.' })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(32) tax_id?: string;

  @ApiProperty({ example: '3548500', description: 'Código IBGE real do município emissor.' })
  @IsString() @Length(7,7) city_code!: string;

  @ApiProperty({ example: 'regular', description: 'Regime fiscal real informado/confirmado no onboarding.' })
  @IsString() @IsNotEmpty() @MaxLength(80) tax_regime!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) municipal_registration?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) organization_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) pilot_label?: string;
}
