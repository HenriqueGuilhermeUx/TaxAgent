import assert from 'node:assert/strict';
import test from 'node:test';
import * as forge from 'node-forge';
import { extractIcpBrasilCnpjFromSubjectAltNameDer, ICP_BRASIL_CNPJ_OID } from '../src/certificates/pkcs12-identity';

function subjectAltNameWithCnpj(cnpj: string): string {
  const otherName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(ICP_BRASIL_CNPJ_OID).getBytes()),
    forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTF8, false, cnpj),
    ]),
  ]);
  const generalNames = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [otherName]);
  return forge.asn1.toDer(generalNames).getBytes();
}

test('extracts legal-person CNPJ from ICP-Brasil subjectAltName otherName OID', () => {
  assert.equal(extractIcpBrasilCnpjFromSubjectAltNameDer(subjectAltNameWithCnpj('12345678000190')), '12345678000190');
});

test('does not confuse an unrelated otherName OID with company CNPJ', () => {
  const unrelated = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer('2.16.76.1.3.1').getBytes()),
      forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.UTF8, false, '12345678000190')]),
    ]),
  ]);
  assert.equal(extractIcpBrasilCnpjFromSubjectAltNameDer(forge.asn1.toDer(unrelated).getBytes()), undefined);
});
