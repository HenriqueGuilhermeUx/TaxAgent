import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as forge from 'node-forge';
import { DpsBuilderService, FiscalCompany } from '../src/xml-engine/dps-builder.service';
import { XmlSignatureService } from '../src/xml-engine/xml-signature.service';

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

  const fixturePassword = 'schema-watch-only';
  const fixturePfx = createEphemeralPfx(fixturePassword);
  const signer = new XmlSignatureService();
  const signedXml = signer.sign(built.xml, built.id, 'infDPS', { pfx: fixturePfx, password: fixturePassword, fingerprint: 'ephemeral-schema-watch' });

  const dir = await mkdtemp(join(tmpdir(), 'taxagent-prodrest-fixture-'));
  try {
    const unsignedPath = join(dir, 'dps-unsigned.xml');
    const signedPath = join(dir, 'dps-signed.xml');
    await writeFile(unsignedPath, built.xml, 'utf8');
    await writeFile(signedPath, signedXml, 'utf8');
    validate(vendor, manifest.dpsXsd, unsignedPath);
    validate(vendor, manifest.dpsXsd, signedPath);

    if (!signedXml.includes('rsa-sha256')) throw new Error('Signed DPS is not using RSA-SHA256');
    if (!signedXml.includes('http://www.w3.org/2001/04/xmlenc#sha256')) throw new Error('Signed DPS is not using SHA-256 digest');
    const forbidden = ['X509SubjectName', 'X509IssuerSerial', 'X509IssuerName', 'X509SerialNumber', 'X509SKI', 'KeyValue', 'RSAKeyValue', 'Modulus', 'Exponent'];
    for (const tag of forbidden) if (signedXml.includes(`<${tag}`) || signedXml.includes(`:${tag}`)) throw new Error(`Signed fixture contains forbidden KeyInfo field ${tag}`);

    console.log(JSON.stringify({ valid: true, unsignedValid: true, signedValid: true, signature: 'RSA-SHA256/SHA-256', dpsId: built.id, schema: manifest.dpsXsd, archiveSha256: manifest.archiveSha256 }, null, 2));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validate(vendor: string, dpsXsd: string, xmlPath: string) {
  const result = spawnSync('xmllint', ['--noout', '--schema', join(vendor, dpsXsd), xmlPath], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `xmllint exited ${result.status}`);
}

function createEphemeralPfx(password: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 60 * 60_000);
  const attrs = [{ name: 'commonName', value: 'TaxAgent schema-watch ephemeral signer' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

void main();
