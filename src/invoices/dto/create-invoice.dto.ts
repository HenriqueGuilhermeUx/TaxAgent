import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length, MaxLength, ValidateNested } from 'class-validator';

class CustomerDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(32) tax_id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiProperty({ example: '3550308' }) @IsString() @Length(7, 7) city_code!: string;
}
class ServiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) description!: string;
  @ApiProperty({ example: 5000 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() national_service_code?: string;
  @ApiPropertyOptional({ description: 'cIndOp when applicable to IBS/CBS.' }) @IsOptional() @IsString() operation_indicator?: string;
  @ApiPropertyOptional({ description: 'CST IBS/CBS.' }) @IsOptional() @IsString() tax_situation?: string;
  @ApiPropertyOptional({ description: 'cClassTrib IBS/CBS.' }) @IsOptional() @IsString() tax_classification?: string;
}
export class CreateInvoiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() company_id!: string;
  @ApiProperty({ enum: ['test', 'production'], default: 'test' }) @IsIn(['test', 'production']) environment!: 'test' | 'production';
  @ApiPropertyOptional({ example: '2026-08-08', description: 'Data de competência fiscal. Se omitida, TaxAgent fixa a data de criação da operação.' }) @IsOptional() @IsDateString({ strict: true }) competence?: string;
  @ApiPropertyOptional({ description: 'Resolved TaxAgent tax decision to bind to this invoice.' }) @IsOptional() @IsString() tax_decision_id?: string;
  @ApiProperty({ type: CustomerDto }) @ValidateNested() @Type(() => CustomerDto) customer!: CustomerDto;
  @ApiProperty({ type: ServiceDto }) @ValidateNested() @Type(() => ServiceDto) service!: ServiceDto;
}
