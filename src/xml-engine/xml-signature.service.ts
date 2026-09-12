import { Injectable } from '@nestjs/common';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { CertificateMaterial } from '../certificates/certificate-vault.service';
import { loadPkcs12Identity } from '../certificates/pkcs12-identity';

@Injectable()
export class XmlSignatureService {
  sign(xml: string, elementId: string, signedElementLocalName: string, material: CertificateMaterial): string {
    const { certificate, privateKey } = loadPkcs12Identity(material.pfx, material.password);
    const signer = new SignedXml({ privateKey: forge.pki.privateKeyToPem(privateKey), publicCert: forge.pki.certificateToPem(certificate) });
    signer.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
    signer.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
    signer.addReference({ xpath: `//*[@Id='${elementId}']`, digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256', transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'] });
    signer.computeSignature(xml, { location: { reference: `//*[local-name(.)='${signedElementLocalName}']`, action: 'after' } });
    const signed = signer.getSignedXml();
    const forbidden = ['X509SubjectName', 'X509IssuerSerial', 'X509IssuerName', 'X509SerialNumber', 'X509SKI', 'KeyValue', 'RSAKeyValue', 'Modulus', 'Exponent'];
    for (const tag of forbidden) if (signed.includes(`<${tag}`) || signed.includes(`:${tag}`)) throw new Error(`Generated XMLDSig contains forbidden KeyInfo field ${tag}`);
    return signed;
  }
}
