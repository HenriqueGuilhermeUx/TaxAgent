import { createHash } from 'node:crypto';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { CertificateMaterial } from '../src/certificates/certificate-vault.service';
import { SchemaRegistryService } from '../src/schema-registry/schema-registry.service';
import { DpsBuilderService, FiscalCompany } from '../src/xml-engine/dps-builder.service';
import { XmlSignatureService } from '../src/xml-engine/xml-signature.service';
import { XmlValidationService } from '../src/xml-engine/xml-validation.service';

async function main() {
  const schemas = new SchemaRegistryService();
  const validation = new XmlValidationService(schemas);
  const builder = new DpsBuilderService({} as any);
  const signature = new XmlSignatureService();

  const company: FiscalCompany = {
    id: 'comp_ci_mogi',
    tax_id: '00000000000000',
    municipal_registration: null,
    city_code: '3530607',
    tax_regime: 'regular',
  };

  const built = builder.buildPreview({
    companyId: company.id,
    environment: 'test',
    competence: '2026-09-23',
    issuedAt: '2026-09-23T18:00:00Z',
    customer: {
      taxId: '11111111111',
      name: 'TOMADOR SINTETICO TAXAGENT CI',
      cityCode: '3530607',
      address: {
        street: 'RUA DE TESTE',
        number: '100',
        district: 'CENTRO',
        postalCode: '08710000',
        cityCode: '3530607',
      },
    },
    service: {
      description: 'SERVICO SINTETICO DE CONFORMIDADE TAXAGENT',
      amount: 100,
      nationalServiceCode: '170101',
      nbsCode: '114011900',
      serviceLocationCityCode: '3530607',
      issRate: 3,
      issTaxation: '1',
      issWithholding: '1',
      finalConsumption: '1',
      operationIndicator: '100301',
      taxSituation: '000',
      taxClassification: '000001',
    },
  }, company, 1);

  if (!built.id.startsWith('DPS3530607')) throw new Error(`Unexpected synthetic Mogi DPS id: ${built.id}`);
  await validation.validateWellFormed(built.xml);
  await validation.validateStrict(built.xml, 'test');

  const { material, certificatePem } = syntheticCertificate();
  const signed = signature.sign(built.xml, built.id, 'infDPS', material, 'sha256');

  await validation.validateWellFormed(signed);
  await validation.validateStrict(signed, 'test');

  if (!signed.includes('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256')) throw new Error('DPS XMLDSig is not RSA-SHA256');
  if (!signed.includes('http://www.w3.org/2001/04/xmlenc#sha256')) throw new Error('DPS XMLDSig digest is not SHA-256');
  if (!signed.includes(`URI="#${built.id}"`)) throw new Error('DPS XMLDSig does not reference the generated infDPS Id');

  const signatureXml = signed.match(/<(?:\w+:)?Signature\b[\s\S]*?<\/(?:\w+:)?Signature>/)?.[0];
  if (!signatureXml) throw new Error('Signed DPS does not contain an XMLDSig Signature element');

  const verifier = new SignedXml({
    publicCert: certificatePem,
    getCertFromKeyInfo: () => null,
  });
  verifier.loadSignature(signatureXml);
  if (!verifier.checkSignature(signed)) throw new Error('Generated DPS XMLDSig failed cryptographic verification');
  const references = verifier.getSignedReferences();
  if (references.length !== 1 || !references[0].includes('infDPS')) throw new Error('XMLDSig authenticated reference is not the expected infDPS element');

  const active = schemas.active('test');
  console.log(JSON.stringify({
    event: 'national_dps_conformance_ok',
    target_city_code: '3530607',
    schema_id: active.id,
    xsd_label: active.xsdLabel,
    unsigned_xsd_valid: true,
    signed_xsd_valid: true,
    signature_verified: true,
    signature_profile: 'xmldsig-rsa-sha256-id-reference',
    dps_sha256: createHash('sha256').update(signed, 'utf8').digest('hex'),
    synthetic_fixture_only: true,
    real_certificate_used: false,
    network_attempted: false,
    fiscal_transmission_attempted: false,
    fiscal_emission_attempted: false,
  }));
}

function syntheticCertificate(): { material: CertificateMaterial; certificatePem: string } {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-12-31T23:59:59Z');
  const attrs = [{ name: 'commonName', value: 'TaxAgent Synthetic National Conformance CI' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const password = 'taxagent-ci-only';
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  const pfx = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
  const certificatePem = forge.pki.certificateToPem(cert);
  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certDer = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');

  return {
    certificatePem,
    material: {
      pfx,
      password,
      fingerprint: createHash('sha256').update(certDer).digest('hex'),
      subjectTaxId: '00000000000000',
      tlsCertificatePem: certificatePem,
      tlsPrivateKeyPem: privateKeyPem,
    },
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
