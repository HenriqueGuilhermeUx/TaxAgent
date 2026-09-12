import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

interface SchemaSource { id: string; status: string; xsdLabel?: string; officialUrl?: string; rtc: string; notes: string }
interface RegistryFile { updatedAt: string; sources: { production: SchemaSource; test: SchemaSource; nt009Preview: SchemaSource } }
interface LocalManifest { dpsXsd: string; eventXsd?: string; archiveSha256: string; downloadedAt: string }

@Injectable()
export class SchemaRegistryService {
  private readonly registry: RegistryFile;
  constructor() {
    this.registry = JSON.parse(readFileSync(join(process.cwd(), 'schemas', 'registry.json'), 'utf8')) as RegistryFile;
  }
  active(environment: FiscalEnvironment): SchemaSource { return this.registry.sources[environment]; }
  previewNt009(): SchemaSource { return this.registry.sources.nt009Preview; }
  localDpsXsd(environment: FiscalEnvironment): string | undefined {
    return process.env.TAXAGENT_NFSE_DPS_XSD || this.localSchema(environment, 'dpsXsd');
  }
  localEventXsd(environment: FiscalEnvironment): string | undefined {
    return process.env.TAXAGENT_NFSE_EVENT_XSD || this.localSchema(environment, 'eventXsd');
  }
  metadata() {
    return { ...this.registry, runtime: { productionSynced: Boolean(this.localDpsXsd('production')), testSynced: Boolean(this.localDpsXsd('test')), productionEventsSynced: Boolean(this.localEventXsd('production')), testEventsSynced: Boolean(this.localEventXsd('test')) } };
  }
  private localSchema(environment: FiscalEnvironment, field: 'dpsXsd' | 'eventXsd'): string | undefined {
    const source = this.active(environment);
    const dir = join(process.cwd(), 'schemas', 'vendor', source.id);
    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) return undefined;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as LocalManifest;
    const relative = manifest[field];
    if (!relative) return undefined;
    const resolved = join(dir, relative);
    return existsSync(resolved) ? resolved : undefined;
  }
}
