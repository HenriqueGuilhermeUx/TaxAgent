import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import AdmZip from 'adm-zip';

test('schema sync retries a truncated HTTP response body without touching installed schemas before validation', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'taxagent-schema-interrupted-'));
  const zip = new AdmZip();
  zip.addFile('DPS_v1.01.xsd', Buffer.from('<xs:schema/>'));
  zip.addFile('pedRegEvento_v1.01.xsd', Buffer.from('<xs:schema/>'));
  zip.addFile('evento_v1.01.xsd', Buffer.from('<xs:schema/>'));
  const payload = zip.toBuffer();
  let requests = 0;
  const server = createServer((_req, res) => {
    requests += 1;
    res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(payload.length) });
    if (requests === 1) {
      res.write(payload.subarray(0, Math.min(8, payload.length)));
      res.socket?.destroy();
      return;
    }
    res.end(payload);
  });
  try {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const vendor = join(root, 'schemas/vendor/fixture-nfse-test');
    await mkdir(vendor, { recursive: true });
    await writeFile(join(vendor, 'previous.xsd'), 'untouched');
    await writeFile(join(root, 'schemas/registry.json'), JSON.stringify({ sources: { test: {
      id: 'fixture-nfse-test', status: 'active',
      officialUrl: `http://127.0.0.1:${address.port}/schemas.zip`,
      expectedArchiveSha256: createHash('sha256').update(payload).digest('hex'),
    } } }));
    const script = join(resolve(import.meta.dirname, '..'), 'scripts/sync-nfse-schemas.ts');
    const tsx = join(resolve(import.meta.dirname, '..'), 'node_modules/.bin/tsx');
    const result = await new Promise<{ code: number | null; output: string }>((done, reject) => {
      const child = spawn(tsx, [script, '--environment=test'], { cwd: root, env: process.env });
      let output = '';
      child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
      child.on('error', reject);
      child.on('close', (code) => done({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
    assert.equal(requests, 2, result.output);
    assert.match(result.output, /retrying/);
    const manifest = JSON.parse(await readFile(join(vendor, 'manifest.json'), 'utf8')) as { archiveSha256: string };
    assert.equal(manifest.archiveSha256, createHash('sha256').update(payload).digest('hex'));
    await assert.rejects(readFile(join(vendor, 'previous.xsd')), { code: 'ENOENT' });
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
