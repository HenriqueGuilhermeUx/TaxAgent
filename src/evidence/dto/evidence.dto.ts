import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBase64, IsBoolean, IsIn, IsISO8601, IsObject, IsOptional, IsString, IsUrl, Matches, MaxLength } from 'class-validator';

export class UploadEvidenceDocumentDto {
  @ApiProperty({ example: 'contrato.pdf' })
  @IsString() @MaxLength(255) filename!: string;

  @ApiPropertyOptional({ example: 'Contrato Cliente XPTO' })
  @IsOptional() @IsString() @MaxLength(255) title?: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional() @IsString() @MaxLength(120) mime_type?: string;

  @ApiPropertyOptional({ example: 'contract' })
  @IsOptional() @IsString() @MaxLength(80) document_type?: string;

  @ApiPropertyOptional({ enum: ['customer_document','fiscal_document','regulatory_source','operation_dossier'] })
  @IsOptional() @IsIn(['customer_document','fiscal_document','regulatory_source','operation_dossier'])
  evidence_kind?: 'customer_document' | 'fiscal_document' | 'regulatory_source' | 'operation_dossier';

  @ApiPropertyOptional({ example: 'customer-operation' })
  @IsOptional() @IsString() @MaxLength(80) category?: string;

  @ApiProperty({ description: 'Base64 do documento. O TaxAgent encaminha ao cofre documental e não persiste os bytes.' })
  @IsString() @IsBase64() data_base64!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsObject() source_context?: Record<string, unknown>;
}

export class CreateRegulatoryChangeDto {
  @ApiProperty() @IsString() @MaxLength(240) title!: string;
  @ApiProperty() @IsString() @MaxLength(5000) summary!: string;
  @ApiProperty() @IsUrl({ require_protocol: true }) @MaxLength(2000) source_url!: string;

  @ApiPropertyOptional() @IsOptional() @IsISO8601() published_at?: string;
  @ApiPropertyOptional({ example: '2027-01-01' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) effective_at?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Matches(/^\d{7}$/, { each: true }) affected_city_codes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) affected_tax_regimes?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) affected_routes?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() requires_action?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() source_document?: RegulatorySourceDocumentDto;
}

export class RegulatorySourceDocumentDto {
  @ApiProperty() @IsString() @MaxLength(255) filename!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) mime_type?: string;
  @ApiProperty() @IsString() @IsBase64() data_base64!: string;
}
