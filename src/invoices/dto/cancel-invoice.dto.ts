import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelInvoiceDto {
  @ApiProperty({ example: '1' })
  @IsString()
  @IsNotEmpty()
  reason_code!: string;

  @ApiProperty({ example: 'Serviço não prestado' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  reason!: string;
}
