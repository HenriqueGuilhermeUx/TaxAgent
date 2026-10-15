import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelInvoiceDto {
  @ApiProperty({ example: '1', enum: ['1', '2', '9'], description: '1=Erro na emissão; 2=Serviço não prestado; 9=Outros' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['1', '2', '9'])
  reason_code!: string;

  @ApiProperty({ example: 'Serviço não prestado' })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  reason!: string;
}
