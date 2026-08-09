import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DpsBuilderService, FiscalCompany } from '../src/xml-engine/dps-builder.service';

async function main() {
  const vendor = join(process.cwd(), 'schemas', 'vendor', 'nfse-prodrest-v1.01-20260727');
  const manifest = JSON.parse(await readFile(join(vendor, 'manifest.json'), 'utf8')) as { dpsXsd: string; archiveSha256: string };
  const builder = new DpsBuilderService(undefined as never);
  const company: FiscalCompany = { id: 'comp_schema_fixture', tax_id: '12345678000190', municipal_registration: '12345', city_code: '3550308', tax_regime: 'regular' };
  const built = builder.buildPreview({
    companyId: company.id,
    environment: 'test',
    competence: '2026-08-08',
    issuedAt: '2026-08-08T23:54:48+00:00',
    customer: { taxId: '98765432000110', name: 'Cliente Fixture LTDA', cityCode: '3550308' },
    service: {
      description: 'Servico de software para validacao estrutural do TaxAgent',
      amount: 100,
      nationalServiceCode: '010201',
      serviceLocationCityCode: '3550308',
      issTaxation: '1',
      issWithholding: '1',
      issRate: 5,
      operationIndicator: '000001',
      taxSituation: '000',
      taxClassification: '000001',
    },
  }, company, 1);
  const dir = await mkdtemp(join(tmpdir(), 'taxagent-prodrest-fixture-'));
  const xmlPath = join(dir, 'dps.xml');
  try {
    await writeFile(xmlPath, built.xml, 'utf8');
    const result = spawnSync('xmllint', ['--noout', '--schema', join(vendor, manifest.dpsXsd), xmlPath], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `xmllint exited ${result.status}`);
    console.log(JSON.stringify({ valid: true, dpsId: built.id, schema: manifest.dpsXsd, archiveSha256: manifest.archiveSha256 }, null, 2));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

void main();
