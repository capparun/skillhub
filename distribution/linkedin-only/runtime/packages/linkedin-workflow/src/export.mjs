import { readFile, writeFile, link, unlink } from 'node:fs/promises';
import { dirname, basename, resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderReport } from './report.mjs';

const fail = code => { throw Object.assign(new Error(code), { code }); };
const credentialKey = /^(authorization|cookie|set-cookie|password|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|session[_-]?token)$/i;
function validate(value, depth = 0) {
  if (depth > 40) fail('invalid_input');
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (credentialKey.test(key)) fail('sensitive_data');
      validate(child, depth + 1);
    }
  }
}
const cell = value => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const safe = /^[\s\uFEFF]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};
const markdown = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('`', '\\`').replaceAll('*', '\\*').replaceAll('_', '\\_').replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll('\r', '').replaceAll('\n', '<br>');
export function serializeExport(data, format) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.results)) fail('invalid_input');
  validate(data);
  if (format === 'html') return renderReport(data);
  if (format === 'json') return JSON.stringify(data, null, 2) + '\n';
  // Preserve the complete envelope and each original entity as JSON. Display
  // fields are escaped; original_json is lossless for downstream re-reading.
  const { results, ...metadata } = data;
  if (format === 'csv') {
    return [['kind', 'index', 'name', 'original_json'], ['metadata', '', '', JSON.stringify(metadata)], ...results.map((row, i) => ['result', i + 1, row?.name ?? '', JSON.stringify(row)])].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  if (format === 'markdown') {
    return '# Sales Navigator export\n\n| Kind | Index | Original JSON |\n| --- | --- | --- |\n' + [['metadata', '', metadata], ...results.map((row, i) => ['result', i + 1, row])].map(([kind, index, row]) => `| ${kind} | ${index} | ${markdown(JSON.stringify(row))} |`).join('\n') + '\n';
  }
  fail('unsupported');
}
export async function exportFile(input) {
  if (!input || Object.keys(input).some(key => !['input_path', 'output_path', 'format'].includes(key)) || typeof input.input_path !== 'string' || typeof input.output_path !== 'string') fail('invalid_input');
  let data;
  try {
    const raw = await readFile(input.input_path, 'utf8');
    if (Buffer.byteLength(raw) > 10 * 1024 * 1024) fail('invalid_input');
    data = JSON.parse(raw);
  } catch (error) { if (error.code === 'invalid_input') throw error; fail('export_read_failed'); }
  const payload = data.ok === true && data.data ? data.data : data;
  const content = serializeExport(payload, input.format);
  const target = resolve(input.output_path);
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    // Atomic publication without overwriting an existing file (including symlinks).
    await link(temporary, target);
  } catch (error) {
    fail(error.code === 'EEXIST' ? 'export_exists' : 'export_write_failed');
  } finally { await unlink(temporary).catch(() => {}); }
  return { operation: 'export', path: target, format: input.format, returned_count: payload.results.length, bytes: Buffer.byteLength(content), status: 'written' };
}
