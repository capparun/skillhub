import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VERSION } from './version.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const ROOT = join(tmpdir(), 'hunter-salesnav-checkpoints');
export async function saveCheckpoint(data, { root = ROOT, now = Date.now() } = {}) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const expires_at = new Date(now + 30 * 60 * 1000).toISOString();
  const record = { ...data, schema_version: 1, adapter_version: VERSION, expires_at };
  const raw = JSON.stringify(record);
  const content_hash = createHash('sha256').update(raw).digest('hex');
  const path = join(root, `${id}.json`);
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(raw); }
  catch (error) { await unlink(path).catch(() => {}); throw error; }
  finally { await handle.close(); }
  return { id, content_hash, query_fingerprint: record.query_fingerprint, adapter_version: VERSION, expires_at, storage: 'local_temporary_file' };
}
export async function readCheckpoint(cursor, { root = ROOT, now = Date.now() } = {}) {
  if (!cursor || typeof cursor !== 'object' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(cursor.id ?? '')) fail('invalid_checkpoint');
  let data;
  try { const raw = await readFile(join(root, `${cursor.id}.json`), 'utf8'); if (Buffer.byteLength(raw) > 4 * 1024 * 1024) fail('invalid_checkpoint'); if (createHash('sha256').update(raw).digest('hex') !== cursor.content_hash) fail('invalid_checkpoint'); data = JSON.parse(raw); }
  catch { fail('invalid_checkpoint'); }
  if (data.schema_version !== 1 || data.adapter_version !== VERSION || cursor.adapter_version !== VERSION) fail('checkpoint_version_mismatch');
  if (!Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= now) fail('checkpoint_expired');
  if (cursor.query_fingerprint !== data.query_fingerprint) fail('query_mismatch');
  return data;
}
