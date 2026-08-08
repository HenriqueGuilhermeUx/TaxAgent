import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

interface SchemaSource {
  id: string;
  status: string;
  xsdLabel?: string;
  officialUrl?: string;
  rtc: string;
  notes: string;
}

interface RegistryFile {
  updatedAt: string;
  sources: {
    production: SchemaSource;
    test: SchemaSource;
    nt009Preview: SchemaSource;
  };
}

@Injectable()
export class SchemaRegistryService {
  private readonly registry: RegistryFile;

  constructor() {
    const path = join(process.cwd(), 'schemas', 'registry.json');
    this.registry = JSON.parse(readFileSync(path, 'utf8')) as RegistryFile;
  }

  active(environment: FiscalEnvironment): SchemaSource {
    return this.registry.sources[environment];
  }

  previewNt009(): SchemaSource {
    return this.registry.sources.nt009Preview;
  }

  metadata() {
    return this.registry;
  }
}
