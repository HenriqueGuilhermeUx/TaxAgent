import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

class CustomerDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(32) tax_id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @ApiProperty({ example: '3550308' }) @IsString() @Length(7, 7) city_code!: string;
}
class ServiceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(2000) description!: string;
  @ApiProperty({ example: 5000 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() amount!: number;
  @ApiPropertyOptional({ example: '010201', description: 'cTribNac / código de tributação nacional.' }) @IsOptional() @IsString() national_service_code?: string;
  @ApiPropertyOptional({ example: '3550308', description: 'Município IBGE onde o serviço é prestado. Explicitamente exigido pelo TaxAgent antes de live.' }) @IsOptional() @IsString() @Length(7, 7) service_location_city_code?: string;
  @ApiPropertyOptional({ enum: ['1', '2', '3', '4'], description: 'tribISSQN: 1 tributável, 2 imunidade, 3 exportação, 4 não incidência.' }) @IsOptional() @IsIn(['1', '2', '3', '4']) iss_taxation?: '1' | '2' | '3' | '4';
  @ApiPropertyOptional({ enum: ['1', '2', '3'], description: 'tpRetISSQN: 1 não retido, 2 tomador, 3 intermediário.' }) @IsOptional() @IsIn(['1', '2', '3']) iss_withholding?: '1' | '2' | '3';
  @ApiPropertyOptional({ example: 5, description: 'Alíquota ISS percentual, quando deve ser declarada pelo emitente.' }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) iss_rate?: number;
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
