import { mkdir, open, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Inter-process exclusion for this plugin only, not a lock on manual Chrome use.
// Never steal a stale lock automatically: a timed-out browser action may still run.
export async function withProfileLock(profile, work, root = join(tmpdir(), 'hunter-salesnav-locks')) {
  if (typeof profile !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(profile)) throw new Error('Invalid profile');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const path = join(root, `${createHash('sha256').update(profile).digest('hex')}.lock`);
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw Object.assign(new Error('Profile is already in use by this plugin.'), { code: 'profile_busy' });
    throw error;
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() }));
    return await work();
  } finally { await handle.close(); await unlink(path); }
}
