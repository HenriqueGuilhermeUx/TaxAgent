import { BadRequestException, Injectable } from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FiscalEngineError } from '../fiscal-core/fiscal-engine.error';
import { FiscalEnvironment } from '../fiscal-core/fiscal.types';
import { SchemaRegistryService } from '../schema-registry/schema-registry.service';

@Injectable()
export class XmlValidationService {
  constructor(private readonly schemas: SchemaRegistryService) {}
  async validateWellFormed(xml: string): Promise<void> {
    const result = XMLValidator.validate(xml);
    if (result !== true) throw new BadRequestException(`Malformed XML: ${result.err.msg}`);
    new XMLParser({ ignoreAttributes: false }).parse(xml);
  }
  async validateStrict(xml: string, environment: FiscalEnvironment): Promise<void> {
    return this.validateAgainst(xml, this.schemas.localDpsXsd(environment), `Official ${environment} DPS XSD is not synced`);
  }
  async validateEventStrict(xml: string, environment: FiscalEnvironment): Promise<void> {
    return this.validateAgainst(xml, this.schemas.localEventXsd(environment), `Official ${environment} event XSD is not synced`);
  }
  private async validateAgainst(xml: string, schema: string | undefined, missingMessage: string): Promise<void> {
    if (!schema) throw new FiscalEngineError('TA_SCHEMA_NOT_SYNCED', `${missingMessage}. Run npm run schemas:sync.`, false);
    const dir = await mkdtemp(join(tmpdir(), 'taxagent-xsd-'));
    const xmlPath = join(dir, 'document.xml');
    try {
      await writeFile(xmlPath, xml, 'utf8');
      await new Promise<void>((resolve, reject) => {
        const child = spawn('xmllint', ['--noout', '--schema', schema, xmlPath]);
        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
        child.on('error', (error) => reject(new FiscalEngineError('TA_XMLLINT_UNAVAILABLE', `xmllint unavailable: ${error.message}`, false)));
        child.on('close', (code) => code === 0 ? resolve() : reject(new FiscalEngineError('TA_FISCAL_SCHEMA_INVALID', stderr.slice(0, 4000) || `xmllint exited ${code}`, false)));
      });
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}
