import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const ICP_BRASIL_CNPJ_OID = '2.16.76.1.3.3';
const PASSWORD_ENV = 'TAXAGENT_PKCS12_PASSWORD';

export interface Pkcs12Identity {
  certificate: X509Certificate;
  certificatePem: string;
  privateKeyPem: string;
}

export function loadPkcs12Identity(pfx: Buffer, password: string): Pkcs12Identity {
  if (!Buffer.isBuffer(pfx) || pfx.length < 64) throw new Error('Invalid or empty PKCS#12 payload');

  const certificateOutput = runOpenSsl(
    ['pkcs12', '-legacy', '-in', '/dev/stdin', '-clcerts', '-nokeys', '-passin', `env:${PASSWORD_ENV}`],
    pfx,
    password,
  );
  const keyOutput = runOpenSsl(
    ['pkcs12', '-legacy', '-in', '/dev/stdin', '-nocerts', '-nodes', '-passin', `env:${PASSWORD_ENV}`],
    pfx,
    password,
  );

  const certificatePem = extractPem(certificateOutput.toString('utf8'), 'CERTIFICATE');
  const privateKeyPem = extractPrivateKeyPem(keyOutput.toString('utf8'));
  const certificate = new X509Certificate(certificatePem);
  const privateKey = createPrivateKey(privateKeyPem);

  const certPublic = certificate.publicKey.export({ format: 'der', type: 'spki' });
  const keyPublic = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  if (!Buffer.from(certPublic).equals(Buffer.from(keyPublic))) {
    throw new Error('PKCS#12 certificate and private key do not form the same identity');
  }

  return { certificate, certificatePem, privateKeyPem };
}

export function extractIcpBrasilCnpj(certificate: X509Certificate): string | undefined {
  return findCnpj(parseDerNodes(certificate.raw), 0);
}

export function extractIcpBrasilCnpjFromSubjectAltNameDer(derBytes: string): string | undefined {
  try {
    return findCnpj(parseDerNodes(Buffer.from(derBytes, 'binary')), 0);
  } catch {
    return undefined;
  }
}

function runOpenSsl(args: string[], input: Buffer, password?: string): Buffer {
  const env = { ...process.env };
  if (password !== undefined) env[PASSWORD_ENV] = password;
  const result = spawnSync('openssl', args, {
    input,
    env,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw new Error(`OpenSSL unavailable: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = Buffer.from(result.stderr ?? []).toString('utf8').replace(/\s+/g, ' ').trim();
    throw new Error(`OpenSSL PKCS#12 validation failed${stderr ? `: ${stderr.slice(0, 400)}` : ''}`);
  }
  return Buffer.from(result.stdout ?? []);
}

function extractPem(text: string, label: string): string {
  const match = text.match(new RegExp(`-----BEGIN ${label}-----[\\s\\S]+?-----END ${label}-----`));
  if (!match) throw new Error(`${label} PEM block not found in PKCS#12`);
  return `${match[0].trim()}\n`;
}

function extractPrivateKeyPem(text: string): string {
  const match = text.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/);
  if (!match) throw new Error('Private key bag not found; TaxAgent requires a complete A1 PKCS#12/PFX');
  return `${match[0].trim()}\n`;
}

interface DerNode {
  tag: number;
  value: Buffer;
  children: DerNode[];
}

function parseDerNodes(input: Buffer): DerNode[] {
  const nodes: DerNode[] = [];
  let offset = 0;
  while (offset < input.length) {
    const parsed = parseDerNode(input, offset);
    nodes.push(parsed.node);
    offset = parsed.next;
  }
  return nodes;
}

function parseDerNode(input: Buffer, offset: number): { node: DerNode; next: number } {
  if (offset >= input.length) throw new Error('Unexpected end of DER');
  const tag = input[offset++];
  if ((tag & 0x1f) === 0x1f) throw new Error('High-tag-number DER is not supported');

  if (offset >= input.length) throw new Error('Missing DER length');
  let length = input[offset++];
  if (length & 0x80) {
    const size = length & 0x7f;
    if (!size || size > 4 || offset + size > input.length) throw new Error('Invalid DER length');
    length = 0;
    for (let i = 0; i < size; i += 1) length = (length << 8) | input[offset++];
  }
  if (offset + length > input.length) throw new Error('DER value exceeds input');

  const value = input.subarray(offset, offset + length);
  const constructed = Boolean(tag & 0x20);
  let children: DerNode[] = [];
  if (constructed && value.length) children = parseDerNodes(value);
  return { node: { tag, value, children }, next: offset + length };
}

function findCnpj(nodes: DerNode[], depth: number): string | undefined {
  if (depth > 16) return undefined;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (isUniversal(node, 6) && decodeOid(node.value) === ICP_BRASIL_CNPJ_OID) {
      const sibling = nodes[index + 1] ? findFourteenPositionIdentifier(nodes[index + 1], depth + 1) : undefined;
      if (sibling) return sibling;
    }

    const nested = findCnpj(node.children, depth + 1);
    if (nested) return nested;

    if (isUniversal(node, 4) && !node.children.length && node.value.length > 2) {
      try {
        const embedded = findCnpj(parseDerNodes(node.value), depth + 1);
        if (embedded) return embedded;
      } catch {
        // OCTET STRING is not embedded DER.
      }
    }
  }
  return undefined;
}

function findFourteenPositionIdentifier(node: DerNode, depth: number): string | undefined {
  if (depth > 16) return undefined;
  for (const child of node.children) {
    const nested = findFourteenPositionIdentifier(child, depth + 1);
    if (nested) return nested;
  }
  if (node.children.length) return undefined;

  const variants = [node.value.toString('utf8'), node.value.toString('latin1')];
  for (const variant of variants) {
    const normalized = variant.replace(/\0/g, '').toUpperCase().trim();
    const exact = normalized.match(/^[A-Z0-9]{14}$/)?.[0];
    if (exact) return exact;
  }
  return undefined;
}

function isUniversal(node: DerNode, type: number): boolean {
  return (node.tag & 0xc0) === 0 && (node.tag & 0x1f) === type;
}

function decodeOid(bytes: Buffer): string {
  if (!bytes.length) return '';
  const firstArc = Math.min(2, Math.floor(bytes[0] / 40));
  const arcs: number[] = [firstArc, bytes[0] - firstArc * 40];
  let value = 0;
  for (let i = 1; i < bytes.length; i += 1) {
    value = value * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      arcs.push(value);
      value = 0;
    }
  }
  if (value !== 0) throw new Error('Invalid OID encoding');
  return arcs.join('.');
}
