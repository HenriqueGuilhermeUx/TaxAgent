import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpsertProviderCredentialsDto {
  @ApiProperty({ example: 'giss' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/)
  provider!: string;

  @ApiProperty({ enum: ['test', 'production'] })
  @IsIn(['test', 'production'])
  environment!: 'test' | 'production';

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { login: '***', password: '***' },
    description: 'Provider-specific secrets. Values are encrypted at rest and are never returned by the API.',
  })
  @IsObject()
  credentials!: Record<string, string>;

  @ApiPropertyOptional({ example: 'Credentials supplied by taxpayer during fiscal onboarding.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
