import fs from 'node:fs';
import path from 'node:path';

const [batchPath, detailDir, jbfPath, outputPath] = process.argv.slice(2);
if (![batchPath, detailDir, jbfPath, outputPath].every(Boolean)) {
  throw new Error('用法：node scripts/prepare-review.mjs <batch.json> <detail-dir> <confirmed-jbf.json> <new-output.json>');
}
if (fs.existsSync(outputPath)) throw new Error(`输出文件已存在: ${outputPath}`);
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
const jbf = JSON.parse(fs.readFileSync(jbfPath, 'utf8'));
if (!jbf.version || !jbf.summary || !jbf.scoring || !Array.isArray(batch.candidates) ||
    !Number.isSafeInteger(batch.requestedCount) || batch.requestedCount < 1) {
  throw new Error('批次或 JBF 输入不完整');
}
const searchConditions = batch.searchConditions;
if (!searchConditions || typeof searchConditions !== 'object' || Array.isArray(searchConditions) ||
    typeof searchConditions.fullText !== 'string' || !searchConditions.fullText.trim() ||
    !['mine', 'accessible'].includes(searchConditions.scope) ||
    !Number.isSafeInteger(searchConditions.limit) || searchConditions.limit !== batch.requestedCount) {
  throw new Error('批次缺少与目标人数一致的实际搜索条件');
}
const ids = batch.candidates.map(item => String(item?.id ?? '').trim());
if (ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id)) || new Set(ids).size !== ids.length) {
  throw new Error('批次包含无效或重复候选人 ID');
}
const allowedStatuses = new Set(['read', 'existing_current_run', 'command_failed']);
if (batch.candidates.some(item => !allowedStatuses.has(item.status))) {
  throw new Error('批次仍有待读取候选人，请从检查点续跑后再生成审核报告');
}
for (const item of batch.candidates) {
  if (!Number.isFinite(item.durationMs) || item.durationMs < 0 ||
      !['complete', 'incomplete', 'unknown'].includes(item.projectReadStatus || 'unknown')) {
    if (batch.version === 1 || Number.isSafeInteger(batch.checkpointSize)) {
      throw new Error(`候选人 ${item.id} 的检查点记录不完整`);
    }
  }
  if (item.status === 'command_failed' && !String(item.error || '').trim()) {
    throw new Error(`候选人 ${item.id} 的失败记录缺少原因`);
  }
}

const candidates = [];
const failures = [];
const detailBase = path.resolve(detailDir);
for (const item of batch.candidates) {
  const id = String(item.id);
  if (!['read', 'existing_current_run'].includes(item.status)) {
    failures.push({ id, error: item.error || item.status || 'read_failed' });
    continue;
  }
  const file = path.resolve(detailBase, `candidate_${id}.json`);
  if (!file.startsWith(`${detailBase}${path.sep}`)) throw new Error(`候选人 ${id} 的详情路径越界`);
  if (!fs.existsSync(file)) {
    failures.push({ id, error: 'detail_file_missing' });
    continue;
  }
  const detail = JSON.parse(fs.readFileSync(file, 'utf8'));
  const identityParts = String(detail.hunterId || '').split(':');
  if (String(detail.id) !== id || identityParts.length !== 3 ||
      identityParts[0] !== 'gllue' || !identityParts[1] || identityParts[2] !== id) {
    throw new Error(`候选人 ${id} 的详情身份与候选人 ID 不一致`);
  }
  if (detail.attachments?.contentRead !== false) throw new Error(`候选人 ${id} 的附件读取边界不明确`);
  candidates.push({ ...detail, readStatus: 'success',
    projectContext: { ...(detail.projectContext || {}), readStatus: item.projectReadStatus || 'unknown' } });
}

const recordedDurations = batch.candidates
  .map(item => Number(item.durationMs))
  .filter(value => Number.isFinite(value) && value >= 0);
const hasPerCandidateDurations = recordedDurations.length === batch.candidates.length;
const totalDuration = recordedDurations.reduce((sum, value) => sum + value, 0);
const derivedDuration = {
  total: totalDuration,
  average: recordedDurations.length ? Math.round(totalDuration / recordedDurations.length) : 0,
  max: recordedDurations.length ? Math.max(...recordedDurations) : 0
};
if ((batch.version === 1 || Number.isSafeInteger(batch.checkpointSize)) && !hasPerCandidateDurations) {
  throw new Error('检查点批次缺少逐人真实耗时');
}
if (hasPerCandidateDurations && batch.durationMs && Number(batch.durationMs.total) !== derivedDuration.total) {
  throw new Error('外部汇总耗时与逐人检查点不一致');
}
const duration = hasPerCandidateDurations ? derivedDuration : batch.durationMs || {};
const checkpointsUsed = Number.isSafeInteger(batch.checkpointSize) &&
  batch.checkpointSize > 0 && batch.checkpointSize < batch.candidates.length;
const result = {
  jbf: { version: jbf.version, summary: jbf.summary, scoring: jbf.scoring },
  requestedCount: batch.requestedCount,
  searchConditions: {
    fullText: searchConditions.fullText.trim(),
    scope: searchConditions.scope,
    limit: searchConditions.limit
  },
  candidates,
  failures,
  performance: {
    durationMs: Number(duration.total) || 0,
    totalReadAttempts: batch.candidates.length,
    successfulReads: candidates.length,
    failedReads: failures.length,
    averageReadMs: Number(duration.average) || 0,
    maxReadMs: Number(duration.max) || 0,
    checkpointsUsed,
    checkpointDecision: checkpointsUsed
      ? `已按每 ${batch.checkpointSize} 人检查点执行，可从未完成候选人续跑`
      : '后续大批次每 10 人设置检查点'
  }
};
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log(path.resolve(outputPath));
