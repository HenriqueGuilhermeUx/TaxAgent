import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class GrantFiscalTransmissionPermitDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) company_id!: string;
  @ApiProperty({ enum: ['test'], example: 'test' }) @IsIn(['test']) environment!: 'test';
  @ApiProperty({ enum: ['nfse-national'], example: 'nfse-national' }) @IsIn(['nfse-national']) provider!: 'nfse-national';
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) prepared_dps_id!: string;
  @ApiProperty({ minimum: 5, maximum: 60, example: 15 }) @IsInt() @Min(5) @Max(60) expiration_minutes!: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
  @ApiProperty({ example: 'AUTHORIZE-ONE-NATIONAL-TEST-TRANSMISSION' })
  @Equals('AUTHORIZE-ONE-NATIONAL-TEST-TRANSMISSION')
  confirmation!: 'AUTHORIZE-ONE-NATIONAL-TEST-TRANSMISSION';
}

export class RevokeFiscalTransmissionPermitDto {
  @ApiProperty({ example: 'REVOKE-UNUSED-TRANSMISSION-PERMIT' })
  @Equals('REVOKE-UNUSED-TRANSMISSION-PERMIT')
  confirmation!: 'REVOKE-UNUSED-TRANSMISSION-PERMIT';

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
