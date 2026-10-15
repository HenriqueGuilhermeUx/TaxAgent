import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TAXAGENT_VERSION } from './common/version';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const config = new DocumentBuilder().setTitle('TaxAgent API').setDescription('Backend-first fiscal infrastructure for Brazil').setVersion(TAXAGENT_VERSION).addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'TaxAgent API Key' }).build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  const port = Number(process.env.PORT ?? 3000); await app.listen(port);
}
void bootstrap();
