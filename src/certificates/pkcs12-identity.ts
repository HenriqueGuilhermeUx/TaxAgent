import * as forge from 'node-forge';

export const ICP_BRASIL_CNPJ_OID = '2.16.76.1.3.3';

type ForgePrivateKey = any;

export interface Pkcs12Identity {
  certificate: forge.pki.Certificate;
  privateKey: ForgePrivateKey;
}

export function loadPkcs12Identity(pfx: Buffer, password: string): Pkcs12Identity {
  const der = forge.util.createBuffer(pfx.toString('binary'));
  const asn1 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const plain = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const certificates = certBags.map((bag) => bag.cert).filter((certificate): certificate is forge.pki.Certificate => Boolean(certificate));
  const privateKeys = [...shrouded, ...plain].map((bag) => bag.key).filter(Boolean) as ForgePrivateKey[];
  if (!certificates.length) throw new Error('Certificate bag not found');
  if (!privateKeys.length) throw new Error('Private key bag not found; TaxAgent requires a complete A1 PKCS#12/PFX');

  for (const certificate of certificates) {
    for (const privateKey of privateKeys) {
      if (rsaKeyMatches(certificate, privateKey)) return { certificate, privateKey };
    }
  }
  throw new Error('PKCS#12 certificate and private key do not form the same RSA identity');
}

export function extractIcpBrasilCnpj(certificate: forge.pki.Certificate): string | undefined {
  const extension = certificate.getExtension('subjectAltName') as unknown as { value?: string } | null;
  if (!extension?.value) return undefined;
  return extractIcpBrasilCnpjFromSubjectAltNameDer(extension.value);
}

export function extractIcpBrasilCnpjFromSubjectAltNameDer(derBytes: string): string | undefined {
  try {
    const root = forge.asn1.fromDer(forge.util.createBuffer(derBytes));
    return findOidSiblingValue(root, ICP_BRASIL_CNPJ_OID, 0);
  } catch {
    return undefined;
  }
}

function findOidSiblingValue(node: forge.asn1.Asn1, oid: string, depth: number): string | undefined {
  if (depth > 8) return undefined;
  const children = Array.isArray(node.value) ? node.value as forge.asn1.Asn1[] : [];
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.type === forge.asn1.Type.OID && typeof child.value === 'string') {
      try {
        if (forge.asn1.derToOid(child.value) === oid) {
          const candidate = children[index + 1] ? findFourteenPositionIdentifier(children[index + 1]) : undefined;
          if (candidate) return candidate;
        }
      } catch { /* continue recursive search */ }
    }
    const nested = findOidSiblingValue(child, oid, depth + 1);
    if (nested) return nested;
  }

  // Some ASN.1 libraries expose the extension value still wrapped in an OCTET STRING.
  // Decode one additional DER layer instead of relying on a single representation.
  if (!children.length && node.type === forge.asn1.Type.OCTETSTRING && typeof node.value === 'string') {
    try {
      const nested = forge.asn1.fromDer(forge.util.createBuffer(node.value));
      return findOidSiblingValue(nested, oid, depth + 1);
    } catch { /* not an embedded DER value */ }
  }
  return undefined;
}

function findFourteenPositionIdentifier(node: forge.asn1.Asn1): string | undefined {
  if (Array.isArray(node.value)) {
    for (const child of node.value as forge.asn1.Asn1[]) {
      const nested = findFourteenPositionIdentifier(child);
      if (nested) return nested;
    }
    return undefined;
  }
  if (typeof node.value !== 'string') return undefined;
  const bytes = Buffer.from(node.value, 'binary');
  const variants = [bytes.toString('utf8'), bytes.toString('latin1')];
  for (const variant of variants) {
    const normalized = variant.replace(/\0/g, '').toUpperCase().trim();
    const exact = normalized.match(/^[A-Z0-9]{14}$/)?.[0];
    if (exact) return exact;
  }
  return undefined;
}

function rsaKeyMatches(certificate: forge.pki.Certificate, privateKey: ForgePrivateKey): boolean {
  try {
    const key = privateKey as { n?: forge.jsbn.BigInteger; e?: forge.jsbn.BigInteger };
    if (!key.n || !key.e) return false;
    const derivedPublic = forge.pki.rsa.setPublicKey(key.n, key.e);
    return forge.pki.publicKeyToPem(derivedPublic) === forge.pki.publicKeyToPem(certificate.publicKey);
  } catch {
    return false;
  }
}
