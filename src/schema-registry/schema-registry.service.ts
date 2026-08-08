import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
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
  sources: { production: SchemaSource; test: SchemaSource; nt009Preview: SchemaSource };
}

interface LocalManifest {
  dpsXsd: string;
  archiveSha256: string;
  downloadedAt: string;
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

  localDpsXsd(environment: FiscalEnvironment): string | undefined {
    const override = process.env.TAXAGENT_NFSE_DPS_XSD;
    if (override) return override;
    const source = this.active(environment);
    const dir = join(process.cwd(), 'schemas', 'vendor', source.id);
    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) return undefined;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as LocalManifest;
    const resolved = join(dir, manifest.dpsXsd);
    return existsSync(resolved) ? resolved : undefined;
  }

  metadata() {
    return {
      ...this.registry,
      runtime: {
        productionSynced: Boolean(this.localDpsXsd('production')),
        testSynced: Boolean(this.localDpsXsd('test')),
      },
    };
  }
}
