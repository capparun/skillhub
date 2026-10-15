import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import path from 'node:path';
import { stableHash, stableValue } from './lib/write-approval.js';

const SUPPORTED_FIELDS = new Set([
  'certificate', 'city', 'company', 'email', 'englishName', 'function',
  'gender', 'highestDegree', 'industry', 'location', 'mobile', 'name',
  'nationality', 'owner', 'skype', 'sourceChannel', 'title', 'wechat'
]);
const CONTACT_FIELDS = new Set(['email', 'mobile', 'skype', 'wechat']);

function text(value, field) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(`${field} 必须是字符串`);
  return value.trim();
}

function readInput(filePath) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`输入文件不存在: ${filePath || '(空)'}`);
  const input = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  const candidateId = String(input.candidateId || '').trim();
  const hunterId = String(input.hunterId || '').trim();
  const hunterMatch = hunterId.match(/^gllue:([^:]+):([^:]+)$/);
  let originHost = '';
  try { originHost = new URL(input.origin).host; } catch {}
  if (!/^\d+$/.test(candidateId) || !hunterMatch || hunterMatch[2] !== candidateId ||
      !originHost || hunterMatch[1] !== originHost) {
    throw new Error('候选人 ID 与租户隔离 hunterId 身份不一致');
  }
  if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error('observedAt 必须是有效的读取时间');
  if (!input.current || typeof input.current !== 'object' || Array.isArray(input.current) ||
      !input.proposed || typeof input.proposed !== 'object' || Array.isArray(input.proposed)) {
    throw new Error('输入必须包含 current 与 proposed 对象');
  }
  const fields = new Set([...Object.keys(input.current), ...Object.keys(input.proposed)]);
  const unsupported = [...fields].filter(field => !SUPPORTED_FIELDS.has(field));
  if (unsupported.length) throw new Error(`不支持的字段: ${unsupported.sort().join(', ')}`);
  if (!Object.keys(input.proposed).length) throw new Error('proposed 至少包含一个待比较字段');
  return { ...input, candidateId, hunterId };
}

function buildComparison(input) {
  const changes = Object.keys(input.proposed).sort().map(field => {
    const current = text(input.current[field], `current.${field}`);
    const proposed = text(input.proposed[field], `proposed.${field}`);
    let kind = 'conflict';
    if (current === proposed) kind = 'unchanged';
    else if (!current && proposed) {
      kind = CONTACT_FIELDS.has(field) && input.fieldStates?.[field] !== 'missing'
        ? 'unknown_blocked' : 'addition';
    }
    else if (current && !proposed) kind = 'removal_blocked';
    return kind === 'unknown_blocked'
      ? { field, kind, current, proposed, fieldState: input.fieldStates?.[field] || 'not_observed' }
      : { field, kind, current, proposed };
  });
  // 2026-09-29 全字段对齐决策：conflict（已有值允许覆盖）与 addition 一样可授权写入；
  // 预览为每个变更绑定旧值(current)与新值(proposed)，update-candidate 写入前
  // 还会把旧值与页面实时值再校验一次（并发守卫）。
  const writeSet = Object.fromEntries(changes
    .filter(change => change.kind === 'addition' || change.kind === 'conflict')
    .map(change => [change.field, change.proposed]));
  const counts = kind => changes.filter(change => change.kind === kind).length;
  const preview = stableValue({
    action: 'update_candidate',
    candidateId: input.candidateId,
    hunterId: input.hunterId,
    origin: input.origin,
    observedAt: input.observedAt,
    changes,
    writeSet,
    additions: counts('addition'),
    conflicts: counts('conflict'),
    removalsBlocked: counts('removal_blocked'),
    unknownBlocked: counts('unknown_blocked'),
    unchanged: counts('unchanged'),
    approvalRequired: true,
    readyForApproval: counts('removal_blocked') === 0 && counts('unknown_blocked') === 0 &&
      counts('addition') + counts('conflict') > 0,
    note: '新增与覆盖（conflict）可进入授权：预览绑定旧值+新值，写入前与页面实时值校验；' +
      '删除风险和未核验联系方式必须返回人工处理'
  });
  const contentHash = stableHash(preview);
  return { ...preview, contentHash };
}

cli({
  site: 'gllue',
  name: 'compare-candidate',
  description: '本地比较 Gllue 当前记录与外部资料，生成更新差异预览；不访问平台、不写入',
  access: 'read',
  strategy: Strategy.LOCAL,
  args: [
    { name: 'input', type: 'string', required: true, description: '包含候选人身份、当前字段和建议字段的 JSON 文件' },
    { name: 'output', type: 'string', required: true, description: '新的更新预览 JSON 文件；拒绝覆盖已有文件' }
  ],
  func: async kwargs => {
    if (fs.existsSync(kwargs.output)) throw new Error(`输出文件已存在: ${kwargs.output}`);
    const result = buildComparison(readInput(kwargs.input));
    fs.mkdirSync(path.dirname(path.resolve(kwargs.output)), { recursive: true });
    fs.writeFileSync(kwargs.output, JSON.stringify(result, null, 2), {
      encoding: 'utf8', flag: 'wx', mode: 0o600
    });
    return {
      candidateId: result.candidateId,
      additions: result.additions,
      conflicts: result.conflicts,
      removalsBlocked: result.removalsBlocked,
      unknownBlocked: result.unknownBlocked,
      unchanged: result.unchanged,
      readyForApproval: result.readyForApproval,
      outputPath: kwargs.output
    };
  }
});
