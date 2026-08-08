import { Injectable } from '@nestjs/common';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { CertificateMaterial } from '../certificates/certificate-vault.service';

@Injectable()
export class XmlSignatureService {
  sign(xml: string, elementId: string, material: CertificateMaterial): string {
    const der = forge.util.createBuffer(material.pfx.toString('binary'));
    const asn1 = forge.asn1.fromDer(der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, material.password);
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
    const cert = certBags[0]?.cert;
    const key = keyBags[0]?.key;
    if (!cert || !key) throw new Error('PKCS#12 must contain certificate and private key');

    const signer = new SignedXml({
      privateKey: forge.pki.privateKeyToPem(key),
      publicCert: forge.pki.certificateToPem(cert),
    });
    signer.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
    signer.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
    signer.addReference({
      xpath: `//*[@Id='${elementId}']`,
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],
    });
    signer.computeSignature(xml, { location: { reference: "//*[local-name(.)='infDPS']", action: 'after' } });
    return signer.getSignedXml();
  }
}
