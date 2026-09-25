import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

interface Source { id: string; status: string; officialUrl?: string; expectedArchiveSha256?: string }
interface Registry { sources: Record<string, Source> }
type EnvironmentKey = 'production' | 'test';

function requestedEnvironments(): EnvironmentKey[] {
  const eq = process.argv.find((arg) => arg.startsWith('--environment='))?.split('=')[1];
  const index = process.argv.indexOf('--environment');
  const spaced = index >= 0 ? process.argv[index + 1] : undefined;
  const value = eq ?? spaced;
  if (!value) return ['production', 'test'];
  if (value !== 'production' && value !== 'test') throw new Error('--environment must be production or test');
  return [value];
}

async function fetchOfficialSchema(url: string, environment: EnvironmentKey, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'TaxAgent-SchemaSync/0.12' } });
      if (response.ok) return response;
      if (response.status < 500 || attempt === attempts) {
        throw new Error(`Schema download failed for ${environment}: HTTP ${response.status}`);
      }
      lastError = new Error(`Schema download transient failure for ${environment}: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }
    const delayMs = 2_000 * attempt;
    console.warn(`Official schema download attempt ${attempt}/${attempts} failed for ${environment}; retrying in ${delayMs}ms.`);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  throw lastError instanceof Error ? lastError : new Error(`Schema download failed for ${environment}`);
}

async function main() {
  const registryPath = join(process.cwd(), 'schemas', 'registry.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8')) as Registry;
  for (const key of requestedEnvironments()) {
    const source = registry.sources[key];
    if (!source?.officialUrl) throw new Error(`No officialUrl configured for ${key}`);
    const response = await fetchOfficialSchema(source.officialUrl, key);
    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const zipSha256 = createHash('sha256').update(zipBuffer).digest('hex');
    if (source.expectedArchiveSha256 && source.expectedArchiveSha256 !== zipSha256) {
      throw new Error(`Official schema archive checksum changed for ${key}: expected ${source.expectedArchiveSha256}, received ${zipSha256}. Review upstream changes before promotion.`);
    }
    const target = join(process.cwd(), 'schemas', 'vendor', source.id);
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    const targetRoot = `${resolve(target)}${sep}`;

    const zip = new AdmZip(zipBuffer);
    const xsdFiles: string[] = [];
    let dpsXsd: string | undefined;
    let eventXsd: string | undefined;
    let registeredEventXsd: string | undefined;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const clean = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
      const output = resolve(target, clean);
      if (!output.startsWith(targetRoot)) throw new Error(`Unsafe path in official schema archive: ${entry.entryName}`);
      await mkdir(dirname(output), { recursive: true });
      const data = entry.getData();
      await writeFile(output, data);
      if (!clean.toLowerCase().endsWith('.xsd')) continue;
      xsdFiles.push(clean);
      const text = data.toString('utf8');
      if (!dpsXsd && /<(?:xs|xsd):element\s+name=["']DPS["']/.test(text)) dpsXsd = clean;
      if (!eventXsd && /<(?:xs|xsd):element\s+name=["']pedRegEvento["']/.test(text)) eventXsd = clean;
      if (!registeredEventXsd && /<(?:xs|xsd):element\s+name=["']evento["']/.test(text)) registeredEventXsd = clean;
    }
    if (!dpsXsd) throw new Error(`Could not locate DPS root XSD in official ${key} archive`);
    if (!eventXsd) throw new Error(`Could not locate pedRegEvento root XSD in official ${key} archive`);
    if (!registeredEventXsd) throw new Error(`Could not locate registered evento root XSD in official ${key} archive`);
    const manifest = {
      sourceId: source.id,
      sourceUrl: source.officialUrl,
      downloadedAt: new Date().toISOString(),
      archiveSha256: zipSha256,
      expectedArchiveSha256: source.expectedArchiveSha256 ?? null,
      dpsXsd,
      eventXsd,
      registeredEventXsd,
      xsdFiles,
    };
    await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${key}: ${source.id} -> ${relative(process.cwd(), target)} (${xsdFiles.length} XSDs; sha256=${zipSha256}; dps=${dpsXsd}; event_request=${eventXsd}; event_registered=${registeredEventXsd})`);
  }
}

void main();
