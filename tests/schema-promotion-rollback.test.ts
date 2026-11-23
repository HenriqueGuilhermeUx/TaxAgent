import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promoteValidatedSchemas } from '../scripts/schema-promotion.js';

test('second rename failure restores previous schemas byte-for-byte', async () => {
  const root = await mkdtemp(join(tmpdir(), 'taxagent-promotion-'));
  const target = join(root, 'installed');
  const staged = join(root, 'staged');
  const backup = join(root, 'backup');
  try {
    await mkdir(target);
    await mkdir(staged);
    const previous = Buffer.from([0, 1, 2, 255, 3]);
    await writeFile(join(target, 'previous.xsd'), previous);
    await writeFile(join(staged, 'new.xsd'), 'replacement');
    let renameCalls = 0;
    await assert.rejects(
      promoteValidatedSchemas(staged, target, backup, {
        rename: async (from, to) => {
          renameCalls += 1;
          if (renameCalls === 2) throw Object.assign(new Error('injected promotion failure'), { code: 'EIO' });
          return rename(from, to);
        },
        rm,
      }),
      /injected promotion failure/,
    );
    assert.equal(renameCalls, 3, 'backup, failed promotion, rollback');
    assert.deepEqual(await readdir(target), ['previous.xsd']);
    assert.deepEqual(await readFile(join(target, 'previous.xsd')), previous);
    assert.deepEqual(await readdir(staged), ['new.xsd']);
    await assert.rejects(readFile(join(backup, 'previous.xsd')), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
