#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT_STATUSES = new Set([
  'success', 'explicit_failure', 'uncertain', 'draft_ready',
  'awaiting_candidate_reply', 'invitation_pending',
  'awaiting_candidate_approval', 'awaiting_execution_approval',
  'blocked', 'not_started',
]);

function text(value) {
  return String(value ?? '').trim();
}

function canonicalProfileUrl(value) {
  try {
    const url = new URL(value);
    if (!['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase())) return '';
    const match = url.pathname.match(/^\/in\/([^/]+)\/?/i);
    return match ? `linkedin.com/in/${decodeURIComponent(match[1]).toLowerCase()}` : '';
  } catch { return ''; }
}

function markdownCell(value) {
  return text(value).replaceAll('|', '\\|').replace(/\s*\n\s*/g, '；') || '—';
}

function normalizeRow(item, index) {
  const candidate = item.candidate || {};
  const profileKey = canonicalProfileUrl(candidate.profileUrl);
  if (!text(candidate.name) || !profileKey) throw new Error(`第 ${index + 1} 位候选人缺少姓名或精确 LinkedIn 主页`);
  const status = text(item.status);
  if (!REPORT_STATUSES.has(status)) throw new Error(`第 ${index + 1} 位候选人的汇总状态无效: ${status || 'empty'}`);
  return {
    candidate: { name: text(candidate.name), profileUrl: text(candidate.profileUrl), profileKey },
    relationshipState: text(item.relationshipState) || 'unknown',
    suggestedChannel: text(item.suggestedChannel) || 'none',
    actualChannel: text(item.actualChannel) || 'none',
    contentStatus: text(item.contentStatus) || 'not_created',
    approvalStatus: text(item.approvalStatus) || 'not_requested',
    status,
    blocker: text(item.blocker),
    nextStep: text(item.nextStep) || '人工复核',
  };
}

export async function summarizeOutreachBatch(input, options = {}) {
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) throw new Error('汇总输入必须包含至少一位候选人');
  const rows = input.candidates.map(normalizeRow);
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.candidate.profileKey)) throw new Error(`候选人重复: ${row.candidate.profileUrl}`);
    seen.add(row.candidate.profileKey);
  }

  const counts = Object.fromEntries([...REPORT_STATUSES].map(status => [status, 0]));
  for (const row of rows) counts[row.status] += 1;
  const result = {
    schemaVersion: 1,
    reportType: 'outreach_batch_summary',
    generatedAt: new Date().toISOString(),
    projectId: text(input.projectId),
    total: rows.length,
    counts,
    candidates: rows,
    advisoryOnly: true,
    executionAllowed: false,
  };

  const outputDir = path.resolve(options.outputDir || process.cwd());
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'outreach-summary.json');
  const markdownPath = path.join(outputDir, 'outreach-summary.md');
  const tableRows = rows.map(row => [
    row.candidate.name, row.relationshipState, row.suggestedChannel, row.actualChannel,
    row.contentStatus, row.approvalStatus, row.status, row.blocker, row.nextStep,
  ].map(markdownCell).join(' | '));
  const activeCounts = Object.entries(counts).filter(([, count]) => count > 0).map(([status, count]) => `${status}: ${count}`).join(' · ');
  await fs.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await fs.writeFile(markdownPath, [
    '# 候选人触达批次汇总', '',
    `- 项目：${markdownCell(result.projectId)}`,
    `- 候选人数：${result.total}`,
    `- 状态：${activeCounts || '无'}`,
    '',
    '候选人 | 关系状态 | 建议渠道 | 实际渠道 | 内容状态 | 审批状态 | 当前结果 | 阻塞原因 | 下一步',
    '--- | --- | --- | --- | --- | --- | --- | --- | ---',
    ...tableRows,
    '',
    '> 本表仅汇总既有结果，不构成候选人批准、内容批准或真实执行授权。', '',
  ].join('\n'), 'utf8');
  return { ...result, jsonPath, markdownPath };
}

async function main() {
  const [inputFile, flag, outputDir] = process.argv.slice(2);
  if (!inputFile || flag !== '--output-dir' || !outputDir) throw new Error('用法: summarize-outreach-batch.mjs <input.json> --output-dir <目录>');
  const input = JSON.parse(await fs.readFile(path.resolve(inputFile), 'utf8'));
  process.stdout.write(`${JSON.stringify(await summarizeOutreachBatch(input, { outputDir }), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
