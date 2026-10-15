import { Injectable } from '@nestjs/common';
import { SignedXml } from 'xml-crypto';
import { CertificateMaterial } from '../certificates/certificate-vault.service';

export type XmlSignatureProfile = 'sha256' | 'sha1';

const XMLDSIG_PROFILES: Record<XmlSignatureProfile, { signatureAlgorithm: string; digestAlgorithm: string }> = {
  sha256: {
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  },
  sha1: {
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  },
};

@Injectable()
export class XmlSignatureService {
  sign(xml: string, elementId: string, signedElementLocalName: string, material: CertificateMaterial, profile: XmlSignatureProfile = 'sha256'): string {
    const signer = this.signer(material, profile);
    const algorithms = XMLDSIG_PROFILES[profile];
    signer.addReference({
      xpath: `//*[@Id='${elementId}']`,
      digestAlgorithm: algorithms.digestAlgorithm,
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    });
    signer.computeSignature(xml, { location: { reference: `//*[local-name(.)='${signedElementLocalName}']`, action: 'after' } });
    return this.assertKeyInfoProfile(signer.getSignedXml());
  }

  signEmptyUri(xml: string, signedElementLocalName: string, material: CertificateMaterial, profile: XmlSignatureProfile = 'sha1'): string {
    const root = new RegExp(`<(?:\\w+:)?${signedElementLocalName}(?:\\s|>)`, 'i');
    if (!root.test(xml)) throw new Error(`XML does not contain root element ${signedElementLocalName}`);

    const signer = this.signer(material, profile);
    const algorithms = XMLDSIG_PROFILES[profile];
    signer.addReference({
      xpath: `/*[local-name(.)='${signedElementLocalName}']`,
      digestAlgorithm: algorithms.digestAlgorithm,
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
      isEmptyUri: true,
    });
    signer.computeSignature(xml, {
      location: { reference: `/*[local-name(.)='${signedElementLocalName}']`, action: 'append' },
    });
    const signed = this.assertKeyInfoProfile(signer.getSignedXml());
    if (!/<Reference\s+URI=""/i.test(signed)) throw new Error('Generated XMLDSig did not preserve the required empty Reference URI');
    return signed;
  }

  private signer(material: CertificateMaterial, profile: XmlSignatureProfile): SignedXml {
    const signer = new SignedXml({ privateKey: material.tlsPrivateKeyPem, publicCert: material.tlsCertificatePem });
    const algorithms = XMLDSIG_PROFILES[profile];
    signer.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
    signer.signatureAlgorithm = algorithms.signatureAlgorithm;
    return signer;
  }

  private assertKeyInfoProfile(signed: string): string {
    const forbidden = ['X509SubjectName', 'X509IssuerSerial', 'X509IssuerName', 'X509SerialNumber', 'X509SKI', 'KeyValue', 'RSAKeyValue', 'Modulus', 'Exponent'];
    for (const tag of forbidden) if (signed.includes(`<${tag}`) || signed.includes(`:${tag}`)) throw new Error(`Generated XMLDSig contains forbidden KeyInfo field ${tag}`);
    return signed;
  }
}
