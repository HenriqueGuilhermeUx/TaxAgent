import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator';

export class ResolveTaxDto {
  @ApiProperty() @IsString() @IsNotEmpty() company_id!: string;
  @ApiProperty({ example: '2026-08-08' }) @IsDateString() effective_at!: string;
  @ApiProperty({ example: 5000 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @ApiProperty({ example: '3550308' }) @IsString() @Length(7, 7) issuer_city_code!: string;
  @ApiPropertyOptional({ example: 'SP' }) @IsOptional() @IsString() issuer_uf?: string;
  @ApiPropertyOptional({ example: '3550308' }) @IsOptional() @IsString() @Length(7, 7) destination_city_code?: string;
  @ApiPropertyOptional({ description: 'NBS code.' }) @IsOptional() @IsString() nbs?: string;
  @ApiPropertyOptional({ description: 'NFS-e national service code.' }) @IsOptional() @IsString() national_service_code?: string;
  @ApiPropertyOptional({ description: 'cIndOp.' }) @IsOptional() @IsString() operation_indicator?: string;
  @ApiPropertyOptional({ description: 'CST IBS/CBS.' }) @IsOptional() @IsString() cst?: string;
  @ApiPropertyOptional({ description: 'cClassTrib.' }) @IsOptional() @IsString() tax_classification?: string;
  @ApiProperty({ enum: ['standard', 'differentiated', 'special', 'unknown'], default: 'unknown' }) @IsIn(['standard', 'differentiated', 'special', 'unknown']) tax_treatment!: 'standard' | 'differentiated' | 'special' | 'unknown';
}
