import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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