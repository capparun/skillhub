import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

export function stableHash(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

export function readFreshApproval(filePath, action, missingMessage, now = Date.now()) {
  if (!filePath) throw new Error(missingMessage);
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`授权文件不存在: ${resolved}`);
  const approval = JSON.parse(fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, ''));
  if (approval.action !== action || approval.approved !== true ||
      approval.source !== 'current_conversation') {
    throw new Error(`授权文件必须明确批准当前对话的 ${action}`);
  }
  const approvedAt = Date.parse(approval.approvedAt);
  if (!Number.isFinite(approvedAt)) throw new Error('授权时间无效');
  if (approvedAt > now + 30_000) throw new Error('授权时间不能来自未来');
  if (now - approvedAt > 15 * 60_000) throw new Error('授权已过期，请重新预览并确认');
  return approval;
}

export function claimWriteApprovalOnce(outputDir, tenant, approval) {
  const key = stableHash({ tenant, action: approval.action, approvedAt: approval.approvedAt,
    origin: approval.origin, candidateName: approval.candidateName,
    contentHash: approval.contentHash }).slice(7);
  const dir = path.join(path.resolve(outputDir), 'write-approvals');
  const marker = path.join(dir, `${key}.json`);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(marker, JSON.stringify({ tenant, action: approval.action,
      claimedAt: new Date().toISOString(), approvalHash: key }),
    { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error('授权已用于一次真实写入尝试，禁止重复提交；请先人工核查平台结果');
    }
    throw new Error(`无法记录一次性写入授权，未点击保存：${error.message}`);
  }
  return marker;
}
