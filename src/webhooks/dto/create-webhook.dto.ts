import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://erp.example.com/webhooks/taxagent' })
  @IsUrl({ require_protocol: true })
  url!: string;

  @ApiPropertyOptional({ example: ['invoice.authorized', 'invoice.rejected'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];
}
