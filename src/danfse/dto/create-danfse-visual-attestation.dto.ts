import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateDanfseVisualAttestationDto {
  @ApiProperty({ description: 'Exact TaxAgent DANFSe fiscal_document id reviewed.' })
  @IsString()
  @MaxLength(128)
  document_id!: string;

  @ApiProperty({ enum: ['matched', 'different', 'inconclusive'] })
  @IsIn(['matched', 'different', 'inconclusive'])
  assessment!: 'matched' | 'different' | 'inconclusive';

  @ApiProperty({ description: 'Reviewer confirms the local layout is consistent with the official reference.' })
  @IsBoolean()
  layout_consistent!: boolean;

  @ApiProperty({ description: 'Reviewer confirms required fiscal sections/fields are visually present.' })
  @IsBoolean()
  required_fields_visible!: boolean;

  @ApiProperty({ description: 'Reviewer confirms text is legible at normal viewing/printing size.' })
  @IsBoolean()
  text_legible!: boolean;

  @ApiProperty({ description: 'Reviewer confirms there is no visible clipping or overlap.' })
  @IsBoolean()
  no_clipping_or_overlap!: boolean;

  @ApiPropertyOptional({ description: 'Bounded operational reason code; never put taxpayer data or free-form PII here.' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_\-]{1,64}$/)
  note_code?: string;
}
