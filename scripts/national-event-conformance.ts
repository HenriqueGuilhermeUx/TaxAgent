import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { CertificateMaterial } from '../src/certificates/certificate-vault.service';
import { CancelFiscalInput } from '../src/fiscal-core/fiscal.types';
import { SchemaRegistryService } from '../src/schema-registry/schema-registry.service';
import { FiscalCompany } from '../src/xml-engine/dps-builder.service';
import { EventBuilderService } from '../src/xml-engine/event-builder.service';
import { XmlSignatureService } from '../src/xml-engine/xml-signature.service';
import { XmlValidationService } from '../src/xml-engine/xml-validation.service';

async function main() {
  const schemas = new SchemaRegistryService();
  const validation = new XmlValidationService(schemas);
  const builder = new EventBuilderService();
  const signature = new XmlSignatureService();

  const company: FiscalCompany = {
    id: 'comp_ci_event',
    tax_id: '00000000000000',
    municipal_registration: null,
    city_code: '3530607',
    tax_regime: 'regular',
  };

  // Synthetic key/identity: used only to exercise the active official XSD/XMLDSig contracts.
  // No real certificate, taxpayer data, network call, provider POST or fiscal emission is involved.
  const syntheticAccessKey = '35306072200000000000000000000000000126090000000000';
  const input: CancelFiscalInput = {
    companyId: company.id,
    environment: 'test',
    accessKey: syntheticAccessKey,
    reasonCode: '1',
    reason: 'Cancelamento sintetico para prova de conformidade TaxAgent CI',
  };

  const built = builder.buildCancellation(input, company);
  if (built.id !== `PRE${syntheticAccessKey}101101`) throw new Error(`Unexpected cancellation request id: ${built.id}`);
  await validation.validateWellFormed(built.xml);
  await validation.validateEventStrict(built.xml, 'test');

  const { material, certificatePem } = syntheticCertificate();
  const signed = signature.sign(built.xml, built.id, 'infPedReg', material, 'sha256');

  await validation.validateWellFormed(signed);
  await validation.validateEventStrict(signed, 'test');

  if (!signed.includes('http://www.w3.org/2001/04/xmldsig-more#rsa-sha256')) throw new Error('Event XMLDSig is not RSA-SHA256');
  if (!signed.includes('http://www.w3.org/2001/04/xmlenc#sha256')) throw new Error('Event XMLDSig digest is not SHA-256');
  if (!signed.includes(`URI="#${built.id}"`)) throw new Error('Event XMLDSig does not reference the generated infPedReg Id');

  const signatureXml = signed.match(/<(?:\w+:)?Signature\b[\s\S]*?<\/(?:\w+:)?Signature>/)?.[0];
  if (!signatureXml) throw new Error('Signed event request does not contain an XMLDSig Signature element');

  const verifier = new SignedXml({ publicCert: certificatePem, getCertFromKeyInfo: () => null });
  verifier.loadSignature(signatureXml);
  if (!verifier.checkSignature(signed)) throw new Error('Generated event request XMLDSig failed cryptographic verification');
  const references = verifier.getSignedReferences();
  if (references.length !== 1 || !references[0].includes('infPedReg')) throw new Error('XMLDSig authenticated reference is not the expected infPedReg element');

  // The SEFIN registered event (EVT) wraps the original pedRegEvento. Prove that the response
  // shape our runtime will trust is accepted by the same active official event XSD.
  const embeddedRequest = signed.replace(/^<\?xml[^>]*\?>\s*/i, '');
  const registeredEventId = `EVT${syntheticAccessKey}101101001`;
  const registeredEvent = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">` +
    `<infEvento Id="${registeredEventId}">` +
    `<verAplic>TaxAgent_0.12</verAplic>` +
    `<ambGer>2</ambGer>` +
    `<nSeqEvento>001</nSeqEvento>` +
    `<dhProc>2026-09-23T18:00:01-03:00</dhProc>` +
    `<nDFe>1</nDFe>` +
    embeddedRequest +
    `</infEvento></evento>`;
  await validation.validateWellFormed(registeredEvent);
  await validation.validateEventStrict(registeredEvent, 'test');

  const active = schemas.active('test');
  const attestation = {
    version: 2,
    environment: 'test',
    schema_id: active.id,
    xsd_label: active.xsdLabel,
    event_code: '101101',
    unsigned_xsd_valid: true,
    signed_xsd_valid: true,
    registered_event_xsd_valid: true,
    signature_verified: true,
    signature_profile: 'xmldsig-rsa-sha256-id-reference',
    synthetic_fixture_only: true,
    real_certificate_used: false,
    network_attempted: false,
    fiscal_transmission_attempted: false,
    fiscal_emission_attempted: false,
  } as const;
  const conformanceDir = join(process.cwd(), 'schemas', 'conformance');
  mkdirSync(conformanceDir, { recursive: true });
  writeFileSync(join(conformanceDir, 'national-event-test.json'), `${JSON.stringify(attestation, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    event: 'national_event_conformance_ok',
    target_city_code: company.city_code,
    ...attestation,
    request_xml_sha256: createHash('sha256').update(signed, 'utf8').digest('hex'),
    registered_event_xml_sha256: createHash('sha256').update(registeredEvent, 'utf8').digest('hex'),
    attestation_persisted: true,
  }));
}

function syntheticCertificate(): { material: CertificateMaterial; certificatePem: string } {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-12-31T23:59:59Z');
  const attrs = [{ name: 'commonName', value: 'TaxAgent Synthetic National Event Conformance CI' }];
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
      subjectTaxId: companyTaxId(),
      tlsCertificatePem: certificatePem,
      tlsPrivateKeyPem: privateKeyPem,
    },
  };
}

function companyTaxId(): string { return '00000000000000'; }

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
