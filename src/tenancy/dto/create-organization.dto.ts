import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Sistemas' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;
}
