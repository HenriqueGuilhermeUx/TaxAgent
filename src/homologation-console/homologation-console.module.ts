import { Module } from '@nestjs/common';
import { HomologationConsoleController } from './homologation-console.controller';

@Module({ controllers: [HomologationConsoleController] })
export class HomologationConsoleModule {}
