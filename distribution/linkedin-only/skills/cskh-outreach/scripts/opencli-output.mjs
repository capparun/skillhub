// Kept self-contained in each distributable Skill; no sibling Skill dependency.
export function unwrapOpencliResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (value.ok === false && value.error) {
    const detail = value.error;
    const error = new Error(`${detail.code || 'OPENCLI_ERROR'}: ${detail.message || 'OpenCLI failed'}`);
    Object.assign(error, detail);
    error.empty = detail.code === 'EMPTY_RESULT';
    throw error;
  }
  if (value.ok === true) {
    if (!Object.hasOwn(value, 'data')) throw new Error('OpenCLI success envelope is missing data');
    return value.data;
  }
  return value;
}

export function parseOpencliOutput(stdout) {
  const text = String(stdout).trim();
  if (!text) throw new Error('OpenCLI 未返回 JSON');
  // Older adapters may print a preamble. Only parsing failures permit another candidate.
  const starts = [0, ...[...text.matchAll(/[\[{]/g)].map(match => match.index)];
  for (const start of new Set(starts)) {
    let value;
    try { value = JSON.parse(text.slice(start)); } catch { continue; }
    return unwrapOpencliResult(value);
  }
  throw new Error('无法解析 OpenCLI JSON 输出');
}
