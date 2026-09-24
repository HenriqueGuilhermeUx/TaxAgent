import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';

interface SchemaSource { id: string; status: string; xsdLabel?: string; officialUrl?: string; rtc: string; notes: string }
interface RegistryFile { updatedAt: string; sources: { production: SchemaSource; test: SchemaSource; nt009Preview: SchemaSource } }
interface LocalManifest { dpsXsd: string; eventXsd?: string; archiveSha256: string; downloadedAt: string }
export interface DpsConformanceAttestation {
  version: number;
  environment: FiscalEnvironment;
  schema_id: string;
  xsd_label?: string;
  unsigned_xsd_valid: boolean;
  signed_xsd_valid: boolean;
  signature_verified: boolean;
  signature_profile: string;
  synthetic_fixture_only: boolean;
  real_certificate_used: boolean;
  network_attempted: boolean;
  fiscal_transmission_attempted: boolean;
  fiscal_emission_attempted: boolean;
}
export interface EventConformanceAttestation extends DpsConformanceAttestation {
  event_code: string;
  registered_event_xsd_valid: boolean;
}

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
  dpsConformance(environment: FiscalEnvironment): { verified: boolean; reason: string; attestation?: DpsConformanceAttestation } {
    const active = this.active(environment);
    const path = join(process.cwd(), 'schemas', 'conformance', `national-dps-${environment}.json`);
    if (!existsSync(path)) return { verified: false, reason: 'build-time DPS conformance attestation is not present' };
    let attestation: DpsConformanceAttestation;
    try {
      attestation = JSON.parse(readFileSync(path, 'utf8')) as DpsConformanceAttestation;
    } catch {
      return { verified: false, reason: 'build-time DPS conformance attestation is unreadable' };
    }
    const verified = attestation.version === 1
      && attestation.environment === environment
      && attestation.schema_id === active.id
      && attestation.unsigned_xsd_valid === true
      && attestation.signed_xsd_valid === true
      && attestation.signature_verified === true
      && attestation.signature_profile === 'xmldsig-rsa-sha256-id-reference'
      && attestation.synthetic_fixture_only === true
      && attestation.real_certificate_used === false
      && attestation.network_attempted === false
      && attestation.fiscal_transmission_attempted === false
      && attestation.fiscal_emission_attempted === false;
    return verified
      ? { verified: true, reason: `DPS builder attested against active schema ${active.id}`, attestation }
      : { verified: false, reason: `DPS conformance attestation does not match active schema/profile ${active.id}`, attestation };
  }
  eventConformance(environment: FiscalEnvironment): { verified: boolean; reason: string; attestation?: EventConformanceAttestation } {
    const active = this.active(environment);
    const path = join(process.cwd(), 'schemas', 'conformance', `national-event-${environment}.json`);
    if (!existsSync(path)) return { verified: false, reason: 'build-time event conformance attestation is not present' };
    let attestation: EventConformanceAttestation;
    try {
      attestation = JSON.parse(readFileSync(path, 'utf8')) as EventConformanceAttestation;
    } catch {
      return { verified: false, reason: 'build-time event conformance attestation is unreadable' };
    }
    const verified = attestation.version === 2
      && attestation.environment === environment
      && attestation.schema_id === active.id
      && attestation.event_code === '101101'
      && attestation.unsigned_xsd_valid === true
      && attestation.signed_xsd_valid === true
      && attestation.registered_event_xsd_valid === true
      && attestation.signature_verified === true
      && attestation.signature_profile === 'xmldsig-rsa-sha256-id-reference'
      && attestation.synthetic_fixture_only === true
      && attestation.real_certificate_used === false
      && attestation.network_attempted === false
      && attestation.fiscal_transmission_attempted === false
      && attestation.fiscal_emission_attempted === false;
    return verified
      ? { verified: true, reason: `National cancellation request and registered event attested against active schema ${active.id}`, attestation }
      : { verified: false, reason: `Event conformance attestation does not match active schema/request/response profile ${active.id}`, attestation };
  }
  metadata() {
    return {
      ...this.registry,
      runtime: {
        productionSynced: Boolean(this.localDpsXsd('production')),
        testSynced: Boolean(this.localDpsXsd('test')),
        productionEventsSynced: Boolean(this.localEventXsd('production')),
        testEventsSynced: Boolean(this.localEventXsd('test')),
        productionDpsConformance: this.dpsConformance('production'),
        testDpsConformance: this.dpsConformance('test'),
        productionEventConformance: this.eventConformance('production'),
        testEventConformance: this.eventConformance('test'),
      },
    };
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
