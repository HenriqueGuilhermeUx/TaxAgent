import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

interface Source {
  id: string;
  status: string;
  officialUrl?: string;
}

interface Registry {
  sources: Record<string, Source>;
}

async function main() {
  const registryPath = join(process.cwd(), 'schemas', 'registry.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8')) as Registry;
  for (const key of ['production', 'test']) {
    const source = registry.sources[key];
    if (!source?.officialUrl) throw new Error(`No officialUrl configured for ${key}`);
    const response = await fetch(source.officialUrl, { headers: { 'user-agent': 'TaxAgent-SchemaSync/0.5' } });
    if (!response.ok) throw new Error(`Schema download failed for ${key}: HTTP ${response.status}`);
    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zipSha256 = createHash('sha256').update(zipBuffer).digest('hex');
    const target = join(process.cwd(), 'schemas', 'vendor', source.id);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    const xsdFiles: string[] = [];
    let dpsXsd: string | undefined;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const clean = entry.entryName.replace(/^\/+/, '').replace(/\.\./g, '_');
      const output = join(target, clean);
      await mkdir(dirname(output), { recursive: true });
      const data = entry.getData();
      await writeFile(output, data);
      if (clean.toLowerCase().endsWith('.xsd')) {
        xsdFiles.push(clean);
        const text = data.toString('utf8');
        if (!dpsXsd && /<(?:xs|xsd):element\s+name=["']DPS["']/.test(text)) dpsXsd = clean;
      }
    }
    if (!dpsXsd) throw new Error(`Could not locate DPS root XSD in official ${key} archive`);
    const manifest = {
      sourceId: source.id,
      sourceUrl: source.officialUrl,
      downloadedAt: new Date().toISOString(),
      archiveSha256: zipSha256,
      dpsXsd,
      xsdFiles,
    };
    await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${key}: ${source.id} -> ${relative(process.cwd(), target)} (${xsdFiles.length} XSDs)`);
  }
}

void main();
