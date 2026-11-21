import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
    // Bound the compressed download before allocating the complete ZIP in memory.
    // Extraction limits below apply to uncompressed entries separately.
    const maxArchiveBytes = 64 * 1024 * 1024;
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null && (!/^\\d+$/.test(declaredLength) || Number(declaredLength) > maxArchiveBytes)) {
      await response.body?.cancel();
      throw new Error(`Official schema archive download limit exceeded for ${key}`);
    }
    if (!response.body) throw new Error(`Empty official schema archive response for ${key}`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloadedBytes += value.byteLength;
        if (downloadedBytes > maxArchiveBytes) {
          await reader.cancel();
          throw new Error(`Official schema archive download limit exceeded for ${key}`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const zipBuffer = Buffer.concat(chunks, downloadedBytes);
    const zipSha256 = createHash('sha256').update(zipBuffer).digest('hex');
    if (source.expectedArchiveSha256 && source.expectedArchiveSha256 !== zipSha256) {
      throw new Error(`Official schema archive checksum changed for ${key}: expected ${source.expectedArchiveSha256}, received ${zipSha256}. Review upstream changes before promotion.`);
    }
    const target = join(process.cwd(), 'schemas', 'vendor', source.id);
    // Never mutate the installed schema set until the complete archive is validated.
    await mkdir(dirname(target), { recursive: true });
    const staged = await mkdtemp(`${target}.staging-`);
    try {
    const targetRoot = `${resolve(staged)}${sep}`;

    const zip = new AdmZip(zipBuffer);
    const xsdFiles: string[] = [];
    const seenPaths = new Set<string>();
    const explicitDirectories = new Set<string>();
    const maxEntryBytes = 32 * 1024 * 1024;
    const maxTotalBytes = 256 * 1024 * 1024;
    const entries = zip.getEntries();
    if (entries.length > 4096) throw new Error(`Too many official schema archive entries for ${key}`);
    let extractedBytes = 0;
    let dpsXsd: string | undefined;
    let eventXsd: string | undefined;
    let registeredEventXsd: string | undefined;
    let fallbackDpsXsd: string | undefined;
    for (const entry of entries) {
      const normalized = entry.entryName.replace(/\\/g, '/');
      if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) throw new Error(`Absolute archive path: ${entry.entryName}`);
      const clean = entry.isDirectory && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
      if (!clean || clean.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`Invalid archive path: ${entry.entryName}`);
      const canonical = clean.toLowerCase();
      if (canonical === 'manifest.json') throw new Error('Reserved archive path: manifest.json');
      if (entry.isDirectory) {
        if (seenPaths.has(canonical)) throw new Error(`Archive file/directory collision: ${entry.entryName}`);
        const segments = canonical.split('/');
        segments.pop();
        let ancestor = '';
        for (const segment of segments) {
          ancestor = ancestor ? `${ancestor}/${segment}` : segment;
          if (seenPaths.has(ancestor)) throw new Error(`Archive file/directory collision: ${entry.entryName}`);
        }
        explicitDirectories.add(canonical);
        continue;
      }
      if (explicitDirectories.has(canonical)) throw new Error(`Archive file/directory collision: ${entry.entryName}`);
      if (seenPaths.has(canonical)) throw new Error(`Duplicate archive path: ${entry.entryName}`);
      // A ZIP file must never occupy a path used as a directory by another file.
      // Detect both orders (parent first or child first), case-insensitively.
      const ancestors = canonical.split('/');
      ancestors.pop();
      let prefix = '';
      for (const part of ancestors) {
        prefix = prefix ? `${prefix}/${part}` : part;
        if (seenPaths.has(prefix)) throw new Error(`Archive file/directory collision: ${entry.entryName}`);
      }
      for (const previous of [...seenPaths, ...explicitDirectories]) {
        if (previous.startsWith(`${canonical}/`)) throw new Error(`Archive file/directory collision: ${entry.entryName}`);
      }
      seenPaths.add(canonical);
      if (entry.header.size > maxEntryBytes || extractedBytes + entry.header.size > maxTotalBytes) throw new Error(`Schema archive extraction limit exceeded for ${key}`);
      const output = resolve(staged, clean);
      if (!output.startsWith(targetRoot)) throw new Error(`Unsafe path in official schema archive: ${entry.entryName}`);
      await mkdir(dirname(output), { recursive: true });
      const data = entry.getData();
      extractedBytes += data.length;
      if (data.length > maxEntryBytes || extractedBytes > maxTotalBytes) throw new Error(`Schema archive extraction limit exceeded for ${key}`);
      await writeFile(output, data);
      if (!clean.toLowerCase().endsWith('.xsd')) continue;
      xsdFiles.push(clean);
      const text = data.toString('utf8');
      const filename = clean.split('/').at(-1) ?? clean;
      if (/^DPS_v\d+\.\d+\.xsd$/i.test(filename)) dpsXsd = clean;
      else if (!fallbackDpsXsd && /<(?:xs|xsd):element\s+name=["']DPS["']/.test(text)) fallbackDpsXsd = clean;
      if (/^pedRegEvento_v\d+\.\d+\.xsd$/i.test(filename)) eventXsd = clean;
      else if (!eventXsd && /<(?:xs|xsd):element\s+name=["']pedRegEvento["']/.test(text)) eventXsd = clean;
      if (/^evento_v\d+\.\d+\.xsd$/i.test(filename)) registeredEventXsd = clean;
      else if (!registeredEventXsd && /<(?:xs|xsd):element\s+name=["']evento["']/.test(text)) registeredEventXsd = clean;
    }
    dpsXsd ??= fallbackDpsXsd;
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
    await writeFile(join(staged, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const backup = `${staged}.backup`;
    let hadPrevious = false;
    try {
      await rename(target, backup);
      hadPrevious = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await rename(staged, target);
    } catch (error) {
      if (hadPrevious) await rename(backup, target);
      throw error;
    }
    if (hadPrevious) {
      try {
        await rm(backup, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Schema promotion succeeded for ${key}, but backup cleanup failed: ${String(error)}`);
      }
    }
    console.log(`${key}: ${source.id} -> ${relative(process.cwd(), target)} (${xsdFiles.length} XSDs; sha256=${zipSha256}; dps=${dpsXsd}; event_request=${eventXsd}; event_registered=${registeredEventXsd})`);
    } finally {
      await rm(staged, { recursive: true, force: true });
    }
  }
}

void main();
