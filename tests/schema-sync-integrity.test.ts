import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import AdmZip from 'adm-zip';

const repoRoot = resolve(import.meta.dirname, '..');
const script = join(repoRoot, 'scripts/sync-nfse-schemas.ts');
const tsx = join(repoRoot, 'node_modules/.bin/tsx');
const sourceId = 'fixture-nfse-test';

async function run(cwd: string): Promise<{ code: number | null; output: string }> {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(tsx, [script, '--environment=test'], { cwd, env: process.env });
    let output = '';
    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolveRun({ code, output }));
  });
}

test('schema sync preserves installed schemas on checksum mismatch and invalid ZIP, then promotes validated ZIP', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'taxagent-schema-sync-'));
  let payload = Buffer.from('not-a-zip');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(payload.length) });
    res.end(payload);
  });
  try {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const url = `http://127.0.0.1:${address.port}/schemas.zip`;
    const vendor = join(root, 'schemas/vendor', sourceId);
    await mkdir(vendor, { recursive: true });
    await writeFile(join(vendor, 'previous.xsd'), 'untouched');
    const registryPath = join(root, 'schemas/registry.json');
    const setRegistry = async (expectedArchiveSha256?: string) => {
      await writeFile(registryPath, JSON.stringify({ sources: { test: {
        id: sourceId, status: 'active', officialUrl: url, expectedArchiveSha256,
      } } }));
    };

    await setRegistry('0'.repeat(64));
    const mismatch = await run(root);
    assert.notEqual(mismatch.code, 0, mismatch.output);
    assert.match(mismatch.output, /checksum changed/);
    assert.equal(await readFile(join(vendor, 'previous.xsd'), 'utf8'), 'untouched');

    await setRegistry();
    const invalid = await run(root);
    assert.notEqual(invalid.code, 0, invalid.output);
    assert.equal(await readFile(join(vendor, 'previous.xsd'), 'utf8'), 'untouched');

    const zip = new AdmZip();
    zip.addFile('DPS_v1.01.xsd', Buffer.from('<xs:schema/>'));
    zip.addFile('pedRegEvento_v1.01.xsd', Buffer.from('<xs:schema/>'));
    zip.addFile('evento_v1.01.xsd', Buffer.from('<xs:schema/>'));
    payload = zip.toBuffer();
    await setRegistry(createHash('sha256').update(payload).digest('hex'));
    const success = await run(root);
    assert.equal(success.code, 0, success.output);
    const manifest = JSON.parse(await readFile(join(vendor, 'manifest.json'), 'utf8')) as { archiveSha256: string; xsdFiles: string[] };
    assert.equal(manifest.archiveSha256, createHash('sha256').update(payload).digest('hex'));
    assert.equal(manifest.xsdFiles.length, 3);
    assert.deepEqual((await readdir(vendor)).sort(), ['DPS_v1.01.xsd', 'evento_v1.01.xsd', 'manifest.json', 'pedRegEvento_v1.01.xsd'].sort());
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});


test('schema sync rejects HTTP 404 and oversized Content-Length without changing installed schemas', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'taxagent-schema-sync-http-'));
  let responseStatus = 404;
  const server = createServer((_req, res) => {
    if (responseStatus === 404) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('missing');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/zip', 'content-length': String(64 * 1024 * 1024 + 1) });
    res.end();
  });
  try {
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const vendor = join(root, 'schemas/vendor', sourceId);
    await mkdir(vendor, { recursive: true });
    await writeFile(join(vendor, 'previous.xsd'), 'untouched');
    await writeFile(join(root, 'schemas/registry.json'), JSON.stringify({ sources: { test: {
      id: sourceId, status: 'active', officialUrl: `http://127.0.0.1:${address.port}/schemas.zip`,
    } } }));

    const missing = await run(root);
    assert.notEqual(missing.code, 0, missing.output);
    assert.match(missing.output, /HTTP 404/);
    assert.doesNotMatch(missing.output, /retrying/i);
    assert.equal(await readFile(join(vendor, 'previous.xsd'), 'utf8'), 'untouched');

    responseStatus = 200;
    const oversized = await run(root);
    assert.notEqual(oversized.code, 0, oversized.output);
    assert.match(oversized.output, /download limit exceeded/);
    assert.equal(await readFile(join(vendor, 'previous.xsd'), 'utf8'), 'untouched');
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
