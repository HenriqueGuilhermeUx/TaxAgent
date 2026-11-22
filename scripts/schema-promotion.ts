import { rename, rm } from 'node:fs/promises';

/** Promote validated schemas; restore the installed set if the second rename fails. */
export async function promoteValidatedSchemas(
  staged: string,
  target: string,
  backup: string,
  fs: Pick<typeof import('node:fs/promises'), 'rename' | 'rm'> = { rename, rm },
): Promise<void> {
  let hadPrevious = false;
  try {
    await fs.rename(target, backup);
    hadPrevious = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  try {
    await fs.rename(staged, target);
  } catch (error) {
    if (hadPrevious) await fs.rename(backup, target);
    throw error;
  }
  if (hadPrevious) {
    try {
      await fs.rm(backup, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Schema promotion succeeded, but backup cleanup failed: ${String(error)}`);
    }
  }
}
