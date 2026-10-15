import assert from 'node:assert/strict';
import test from 'node:test';
import { extractIcpBrasilCnpjFromSubjectAltNameDer, ICP_BRASIL_CNPJ_OID } from '../src/certificates/pkcs12-identity';

function subjectAltNameWithCnpj(cnpj: string, oid = ICP_BRASIL_CNPJ_OID): string {
  const otherName = tlv(0xa0, Buffer.concat([
    tlv(0x06, oidBytes(oid)),
    tlv(0xa0, tlv(0x0c, Buffer.from(cnpj, 'utf8'))),
  ]));
  return tlv(0x30, otherName).toString('binary');
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
}

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function oidBytes(oid: string): Buffer {
  const arcs = oid.split('.').map(Number);
  const out: number[] = [arcs[0] * 40 + arcs[1]];
  for (const arc of arcs.slice(2)) {
    const encoded = [arc & 0x7f];
    let value = Math.floor(arc / 128);
    while (value > 0) {
      encoded.unshift((value & 0x7f) | 0x80);
      value = Math.floor(value / 128);
    }
    out.push(...encoded);
  }
  return Buffer.from(out);
}

test('extracts legal-person CNPJ from ICP-Brasil subjectAltName otherName OID', () => {
  assert.equal(extractIcpBrasilCnpjFromSubjectAltNameDer(subjectAltNameWithCnpj('12345678000190')), '12345678000190');
});

test('also handles subjectAltName DER wrapped in an OCTET STRING', () => {
  const wrapped = tlv(0x04, Buffer.from(subjectAltNameWithCnpj('12345678000190'), 'binary')).toString('binary');
  assert.equal(extractIcpBrasilCnpjFromSubjectAltNameDer(wrapped), '12345678000190');
});

test('does not confuse an unrelated otherName OID with company CNPJ', () => {
  assert.equal(extractIcpBrasilCnpjFromSubjectAltNameDer(subjectAltNameWithCnpj('12345678000190', '2.16.76.1.3.1')), undefined);
});
