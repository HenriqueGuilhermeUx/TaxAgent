import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class CanonicalNominalRatesDto {
  @ApiProperty({ example: 8.8, description: 'CBS nominal rate in percentage points. Must come from a verified source; TaxAgent never invents it.' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(100) cbs!: number;

  @ApiProperty({ example: 0.05, description: 'IBS state nominal rate in percentage points.' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(100) ibs_state!: number;

  @ApiProperty({ example: 0.05, description: 'IBS municipal nominal rate in percentage points.' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(100) ibs_municipal!: number;
}

export class CanonicalRegularItemDto {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(9999999) number!: number;
  @ApiProperty({ example: '115012000', description: 'Verified NBS code for NFS-e.' }) @IsString() @IsNotEmpty() @MaxLength(32) nbs!: string;
  @ApiProperty({ example: '200' }) @IsString() @Matches(/^\d{3}$/) cst!: string;
  @ApiProperty({ example: '200043' }) @IsString() @Matches(/^\d{6}$/) tax_classification!: string;
  @ApiProperty({ example: 200 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) tax_base!: number;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) quantity?: number;
  @ApiPropertyOptional({ example: 'UN' }) @IsOptional() @IsString() @MaxLength(16) unit?: string;
  @ApiPropertyOptional({ type: CanonicalNominalRatesDto, description: 'Required for facts from 2027 onward by the pinned regular engine; forbidden before 2027.' })
  @IsOptional() @ValidateNested() @Type(() => CanonicalNominalRatesDto) nominal_rates?: CanonicalNominalRatesDto;
}

export class CanonicalRegularCalculationDto {
  @ApiProperty({ example: 'order-123', description: 'Stable consumer-side operation identifier.' }) @IsString() @IsNotEmpty() @MaxLength(128) operation_id!: string;
  @ApiProperty({ example: '2026-01-01T09:50:05-03:00' }) @IsDateString() effective_at!: string;
  @ApiProperty({ example: '4314902' }) @IsString() @Matches(/^\d{7}$/) municipality_code!: string;
  @ApiProperty({ example: 'RS' }) @IsString() @Matches(/^[A-Z]{2}$/) uf!: string;
  @ApiProperty({ enum: ['nfse'], example: 'nfse' }) @IsIn(['nfse']) document_kind!: 'nfse';
  @ApiProperty({ type: [CanonicalRegularItemDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CanonicalRegularItemDto) items!: CanonicalRegularItemDto[];
}

export class CanonicalSimplesItemDto {
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(9999999) number!: number;
  @ApiProperty({ example: '01', description: 'Official cAtivSN valid for the effective date/document.' }) @IsString() @Matches(/^\d{2}$/) activity_code!: string;
  @ApiProperty({ example: '000001' }) @IsString() @Matches(/^\d{6}$/) tax_classification!: string;
  @ApiProperty({ example: 950 }) @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) tax_base!: number;
  @ApiProperty({ example: 0, description: 'Selective Tax amount already calculated; use 0 when genuinely not applicable.' })
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) selective_tax_amount!: number;
  @ApiPropertyOptional({ example: 1.25, description: 'Effective Simples IBS rate in percentage points, when applicable. Never inferred.' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(100) ibs_effective_rate?: number;
  @ApiPropertyOptional({ example: 2.75, description: 'Effective Simples CBS rate in percentage points, when applicable. Never inferred.' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(100) cbs_effective_rate?: number;
}

export class CanonicalSimplesCalculationDto {
  @ApiProperty({ example: 'sale-456' }) @IsString() @IsNotEmpty() @MaxLength(128) operation_id!: string;
  @ApiProperty({ example: '2027-03-15' }) @IsDateString() effective_date!: string;
  @ApiProperty({ enum: ['nfe', 'nfce'], example: 'nfe', description: 'The pinned Simples 0.0.6 engine currently supports NF-e/NFC-e document types; NFS-e is not claimed here.' })
  @IsIn(['nfe', 'nfce']) document_kind!: 'nfe' | 'nfce';
  @ApiProperty({ enum: ['1', '2', '3', '4'], example: '1' }) @IsIn(['1', '2', '3', '4']) crt!: '1' | '2' | '3' | '4';
  @ApiPropertyOptional({ enum: ['1', '2'] }) @IsOptional() @IsIn(['1', '2']) ibs_cbs_regime_type?: '1' | '2';
  @ApiPropertyOptional({ enum: ['1', '2', '3', '4'], description: 'Government buyer entity type, when the operation is a government purchase.' })
  @IsOptional() @IsIn(['1', '2', '3', '4']) government_entity_type?: '1' | '2' | '3' | '4';
  @ApiProperty({ type: [CanonicalSimplesItemDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CanonicalSimplesItemDto) items!: CanonicalSimplesItemDto[];
}
