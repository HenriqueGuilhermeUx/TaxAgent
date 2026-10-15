import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsNotEmpty, IsString } from 'class-validator';

export class UploadCertificateDto {
  @ApiProperty({ description: 'A1 PKCS#12 (.pfx/.p12) encoded as base64. Never persisted in plaintext.' })
  @IsString()
  @IsBase64()
  pfx_base64!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
