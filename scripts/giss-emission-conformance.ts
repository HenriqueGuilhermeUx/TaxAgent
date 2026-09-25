import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { CertificateMaterial } from '../src/certificates/certificate-vault.service';
import { buildAbrasfRps } from '../src/providers/giss/abrasf-rps.builder';
import { buildAbrasfLoteRps, GISS_SEND_BATCH_NAMESPACE } from '../src/providers/giss/giss-batch.builder';
import { buildGissEmissionSoapEnvelope } from '../src/providers/giss/giss-emission-soap.builder';
import { buildGissCabecalho } from '../src/providers/giss/giss-header.builder';
import { GissSignatureService } from '../src/providers/giss/giss-signature.service';
import { GISS_SOAP_REQUEST_NAMESPACE } from '../src/providers/giss/giss-wsdl-contract';
import { XmlSignatureService } from '../src/xml-engine/xml-signature.service';

const OFFICIAL_XSD_URL = 'https://santos.giss.com.br/giss-ajuda/manuais/Schemas_XSD-Servicos_Prestados.rar';
const EXPECTED_RAR_SHA256 = process.env.TAXAGENT_GISS_XSD_SHA256?.trim() ?? '';
const ROOT = process.cwd();
const schemaDir = join(ROOT, 'schemas', 'giss-santos', 'servicos-prestados');
const archivePath = join('/tmp', 'taxagent-giss-santos-servicos-prestados.rar');

function listFiles(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) out.push(...listFiles(full, suffix));
    else if (name.toLowerCase().endsWith(suffix)) out.push(full);
  }
  return out;
}

function schemaForRoot(rootName: string, targetNamespace: string): string {
  const candidates: Array<{ file: string; targetNamespace: string | null }> = [];
  for (const file of listFiles(schemaDir, '.xsd')) {
    const body = readFileSync(file, 'utf8');
    const rootPattern = new RegExp(`<(?:(?:\\w+):)?element\\b[^>]*\\bname=["']${rootName}["']`, 'i');
    if (!rootPattern.test(body)) continue;
    const namespaceMatch = body.match(/\btargetNamespace=["']([^"']+)["']/i);
    const candidateNamespace = namespaceMatch?.[1] ?? null;
    candidates.push({ file, targetNamespace: candidateNamespace });
    if (candidateNamespace === targetNamespace) return file;
  }
  throw new Error(`Official GISS XSD package has no exact ${rootName} schema for ${targetNamespace}; candidates=${JSON.stringify(candidates.map((candidate) => ({ file: relative(schemaDir, candidate.file), targetNamespace: candidate.targetNamespace })))}`);
}

function validateWithXmllint(xml: string, schemaPath: string, label: string): void {
  const xmlPath = join(dirname(schemaPath), `.taxagent-${label}.xml`);
  writeFileSync(xmlPath, xml, 'utf8');
  try {
    execFileSync('xmllint', ['--noout', '--schema', schemaPath, xmlPath], {
      cwd: dirname(schemaPath),
      stdio: 'pipe',
    });
  } catch (error) {
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error
      ? String((error as { stderr?: Buffer | string }).stderr ?? '')
      : '';
    throw new Error(`Official GISS XSD rejected ${label}: ${stderr.slice(0, 4000)}`);
  }
}

function syntheticCertificate(): { material: CertificateMaterial; certificatePem: string } {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2027-12-31T23:59:59Z');
  const attrs = [{ name: 'commonName', value: 'TaxAgent Synthetic GISS Conformance CI' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const password = randomBytes(24).toString('base64url');
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

function verifySignature(xml: string, signatureXml: string, certificatePem: string, expectedUri: string): void {
  if (!signatureXml.includes(`URI="#${expectedUri}"`)) throw new Error(`XMLDSig does not reference #${expectedUri}`);
  if (!signatureXml.includes('http://www.w3.org/2000/09/xmldsig#rsa-sha1')) throw new Error(`XMLDSig for ${expectedUri} is not RSA-SHA1`);
  if (!signatureXml.includes('http://www.w3.org/2000/09/xmldsig#sha1')) throw new Error(`XMLDSig digest for ${expectedUri} is not SHA1`);
  const verifier = new SignedXml({ publicCert: certificatePem, getCertFromKeyInfo: () => null });
  verifier.loadSignature(signatureXml);
  if (!verifier.checkSignature(xml)) throw new Error(`XMLDSig for ${expectedUri} failed cryptographic verification`);
}

async function main() {
  mkdirSync(schemaDir, { recursive: true });
  execFileSync('curl', [
    '--fail', '--location', '--silent', '--show-error', '--retry', '4', '--retry-all-errors',
    '--connect-timeout', '15', '--max-time', '120', '--output', archivePath, OFFICIAL_XSD_URL,
  ], { stdio: 'inherit' });

  const archive = readFileSync(archivePath);
  const archiveSha256 = createHash('sha256').update(archive).digest('hex');
  if (!EXPECTED_RAR_SHA256) {
    console.error(JSON.stringify({
      event: 'giss_official_xsd_checksum_discovered',
      source: OFFICIAL_XSD_URL,
      sha256: archiveSha256,
      bytes: archive.length,
      action: 'Pin TAXAGENT_GISS_XSD_SHA256 in Docker build before allowing conformance to pass',
    }));
    process.exit(2);
  }
  if (archiveSha256 !== EXPECTED_RAR_SHA256) {
    throw new Error(`Official GISS XSD archive checksum changed: expected ${EXPECTED_RAR_SHA256}, got ${archiveSha256}`);
  }

  execFileSync('unar', ['-f', '-o', schemaDir, archivePath], { stdio: 'pipe' });
  const schemaPath = schemaForRoot('EnviarLoteRpsEnvio', GISS_SEND_BATCH_NAMESPACE);

  const rps = buildAbrasfRps({
    number: '1',
    series: 'TA',
    issuedAt: '2026-09-24T12:00:00-03:00',
    providerTaxId: '00000000000000',
    municipalRegistration: '1234567',
    customerTaxId: '11111111111',
    customerName: 'TOMADOR SINTETICO TAXAGENT CI',
    customerAddress: {
      street: 'RUA DE TESTE',
      number: '100',
      district: 'CENTRO',
      postalCode: '11010000',
      cityCode: '3548500',
    },
    serviceCode: '17.01',
    nbsCode: '114011900',
    description: 'SERVICO SINTETICO DE CONFORMIDADE GISS TAXAGENT',
    amount: 100,
    issRate: 3,
    issWithholding: '1',
    issExigibility: '1',
    serviceCityCode: '3548500',
  });
  const unsignedBatch = buildAbrasfLoteRps({
    batchNumber: '1',
    providerTaxId: '00000000000000',
    municipalRegistration: '1234567',
    rpsXml: rps,
  });
  validateWithXmllint(unsignedBatch, schemaPath, 'giss-unsigned-batch');

  const { material, certificatePem } = syntheticCertificate();
  const signatures = new GissSignatureService(new XmlSignatureService());
  const signedBatch = signatures.signRpsAndBatch(unsignedBatch, material);
  validateWithXmllint(signedBatch, schemaPath, 'giss-signed-batch');

  const signaturePattern = new RegExp('<(?:\\w+:)?Signature\\b[\\s\\S]*?</(?:\\w+:)?Signature>', 'g');
  const signatureXmls = [...signedBatch.matchAll(signaturePattern)].map((match) => match[0]);
  if (signatureXmls.length !== 2) throw new Error(`Expected exactly 2 GISS signatures, found ${signatureXmls.length}`);
  const rpsSignature = signatureXmls.find((value) => value.includes('URI="#RPS1"'));
  const batchSignature = signatureXmls.find((value) => value.includes('URI="#LOTE1"'));
  if (!rpsSignature || !batchSignature) throw new Error('GISS signatures do not reference both RPS1 and LOTE1');
  verifySignature(signedBatch, rpsSignature, certificatePem, 'RPS1');
  verifySignature(signedBatch, batchSignature, certificatePem, 'LOTE1');

  const envelope = buildGissEmissionSoapEnvelope({
    targetNamespace: GISS_SOAP_REQUEST_NAMESPACE,
    requestWrapper: 'RecepcionarLoteRpsRequest',
    soapVersion: '1.1',
    headerXml: buildGissCabecalho(),
    signedBatchXml: signedBatch,
  });
  if (!envelope.includes('<tns:RecepcionarLoteRpsRequest>')) throw new Error('Emission SOAP envelope wrapper mismatch');
  if (!envelope.includes('&lt;EnviarLoteRpsEnvio')) throw new Error('Signed batch is not escaped inside nfseDadosMsg');
  if (envelope.includes('<EnviarLoteRpsEnvio xmlns=')) throw new Error('Inner fiscal XML leaked outside escaped nfseDadosMsg string payload');

  const attestation = {
    version: 1,
    environment: 'test',
    city_code: '3548500',
    provider: 'giss',
    layout: 'giss-2.04',
    source_url: OFFICIAL_XSD_URL,
    source_sha256: archiveSha256,
    xsd_entrypoint: relative(schemaDir, schemaPath),
    fiscal_root_namespace: GISS_SEND_BATCH_NAMESPACE,
    unsigned_batch_xsd_valid: true,
    signed_batch_xsd_valid: true,
    rps_signature_verified: true,
    batch_signature_verified: true,
    signature_profile: 'xmldsig-rsa-sha1-id-reference',
    soap_version: '1.1',
    soap_wrapper: 'RecepcionarLoteRpsRequest',
    soap_namespace: GISS_SOAP_REQUEST_NAMESPACE,
    synthetic_fixture_only: true,
    real_certificate_used: false,
    network_method: 'GET_DOWNLOAD_OFFICIAL_XSD_ONLY',
    fiscal_transmission_attempted: false,
    fiscal_emission_attempted: false,
  } as const;

  const conformanceDir = join(ROOT, 'schemas', 'conformance');
  mkdirSync(conformanceDir, { recursive: true });
  writeFileSync(join(conformanceDir, 'giss-santos-emission-test.json'), `${JSON.stringify(attestation, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    event: 'giss_santos_emission_conformance_ok',
    ...attestation,
    signed_batch_sha256: createHash('sha256').update(signedBatch, 'utf8').digest('hex'),
    soap_request_sha256: createHash('sha256').update(envelope, 'utf8').digest('hex'),
    attestation_persisted: true,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
