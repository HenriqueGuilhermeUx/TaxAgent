import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'ERP production' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ enum: ['test', 'production'] })
  @IsIn(['test', 'production'])
  environment!: 'test' | 'production';

  @ApiPropertyOptional({ example: ['*'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}
