import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, writeFile, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VERSION } from './version.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
const digest = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const normalized = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase() : null;
async function directory(root = join(tmpdir(), 'hunter-salesnav-execution-contexts')) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid()) fail('invalid_execution_context');
  return root;
}
async function load(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 512 * 1024 || stat.mode & 0o077 || process.getuid && stat.uid !== process.getuid()) fail('invalid_execution_context');
    const data = JSON.parse(await handle.readFile('utf8'));
    if (digest(data.payload) !== data.checksum) fail('invalid_execution_context');
    return data.payload;
  } finally { await handle.close(); }
}
export async function issueExecutionContext(report, { root, now = Date.now } = {}) {
  if (report.connection_binding?.status !== 'observed' || report.identity_match !== true || report.account_binding?.status !== 'observed' || !report.account_binding.profile_url || report.salesnav_access?.status !== 'available') return null;
  const folder = await directory(root);
  const time = now();
  // Only expire this module's private, checksummed context files.
  for (const name of (await readdir(folder)).filter(name => validId(name.replace(/\.json$/, '')) && name.endsWith('.json')).slice(0, 100)) {
    try { const old = await load(join(folder, name)); if (old.schema === 1 && Number.isFinite(old.expires_at) && old.expires_at <= time) await unlink(join(folder, name)); } catch {}
  }
  const payload = { schema: 1, adapter_version: VERSION, id: randomUUID(), created_at: time, expires_at: time + 300000, report: structuredClone(report) };
  await writeFile(join(folder, payload.id + '.json'), JSON.stringify({ payload, checksum: digest(payload) }), { flag: 'wx', mode: 0o600 });
  return { id: payload.id, expires_at: payload.expires_at, full_check_at: report.checked_at, semantics: 'cached_diagnostic_requires_fresh_identity_and_target_validation' };
}
export async function readExecutionContext(id, binding, { root, now = Date.now } = {}) {
  if (!validId(id)) fail('invalid_execution_context');
  let payload;
  try { payload = await load(join(await directory(root), id + '.json')); } catch { fail('invalid_execution_context'); }
  if (payload.schema !== 1 || payload.id !== id || payload.adapter_version !== VERSION || !Number.isFinite(payload.created_at) || payload.expires_at !== payload.created_at + 300000 || payload.created_at > now()) fail('invalid_execution_context');
  if (now() >= payload.expires_at) fail('context_expired');
  const report = payload.report;
  if (report?.connection_binding?.status !== 'observed' || report.identity_match !== true || report.salesnav_access?.status !== 'available' || report.account_binding?.status !== 'observed') fail('invalid_execution_context');
  if (report.profile !== binding.profile || normalized(report.observed_identity) !== normalized(binding.expected_identity) || !binding.expected_profile_url || report.account_binding.profile_url !== binding.expected_profile_url) fail('identity_mismatch');
  return payload;
}
export async function invalidateExecutionContext(id, { root } = {}) {
  if (!validId(id)) return;
  try { await unlink(join(await directory(root), id + '.json')); } catch {}
}

// Partial collection is a successful envelope with an interrupted operation,
// not successful evidence for keeping its diagnostic context alive.
export async function invalidateInterruptedContext(data, id, options) {
  await invalidateExecutionContext(id, options);
  data.execution_context = { status: 'unavailable', reason: 'operation_interrupted', code: data.interruption.code };
}
