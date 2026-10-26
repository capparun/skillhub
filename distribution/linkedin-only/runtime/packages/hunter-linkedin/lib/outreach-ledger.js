import { canonicalProfileUrl } from './relationship-state.js';

const RESULT_STATUSES = new Set(['success', 'explicit_failure', 'uncertain']);

function intentKey(intent) {
  const profileKey = canonicalProfileUrl(intent.candidate?.profileUrl || '');
  if (!profileKey) throw new Error('必须提供候选人主页的精确 LinkedIn URL');
  if (!intent.channel) throw new Error('缺少触达渠道');
  if (!intent.purpose) throw new Error('缺少触达目的');
  return { profileKey, key: `${profileKey}|${intent.channel}|${intent.purpose}` };
}

export function checkOutreachAttempt(entries = [], intent = {}) {
  const { key } = intentKey(intent);
  const previous = entries.filter(entry => entry.intentKey === key);
  if (previous.length === 0) return { allowed: true, reason: 'no_previous_attempt' };

  const latest = previous[previous.length - 1];
  if (latest.result.status === 'uncertain') return { allowed: false, reason: 'unresolved_previous_attempt' };
  if (latest.result.status === 'success') return { allowed: false, reason: 'duplicate_success' };
  if (latest.result.status === 'explicit_failure' && latest.result.externalActionCreated === false) {
    return { allowed: true, reason: 'safe_retry_after_explicit_failure' };
  }
  return { allowed: false, reason: 'previous_attempt_not_safe_to_retry' };
}

export function recordOutreachAttempt(entries = [], event = {}, options = {}) {
  const { profileKey, key } = intentKey(event);
  if (Array.isArray(options.allowedProfileUrls) && options.allowedProfileUrls.length > 0) {
    const allowed = new Set(options.allowedProfileUrls.map(canonicalProfileUrl).filter(Boolean));
    if (!allowed.has(profileKey)) throw new Error('候选人不在允许的测试对象中');
  }

  const approval = event.approval || {};
  if (approval.approved !== true || approval.source !== 'current_conversation' || !Number.isFinite(Date.parse(approval.approvedAt || ''))) {
    throw new Error('缺少当前对话中的有效人工审批');
  }
  if (!event.contentHash || approval.contentHash !== event.contentHash) throw new Error('审批内容哈希与待执行内容不一致');
  if (!RESULT_STATUSES.has(event.result?.status)) throw new Error('执行结果必须是 success、explicit_failure 或 uncertain');
  if (!Number.isFinite(Date.parse(event.result?.occurredAt || ''))) throw new Error('执行结果缺少有效时间');

  const check = checkOutreachAttempt(entries, event);
  if (!check.allowed) throw new Error(`触达被阻止: ${check.reason}`);

  const entry = {
    schemaVersion: 1,
    intentKey: key,
    candidate: { name: event.candidate?.name || '', profileUrl: event.candidate.profileUrl, profileKey },
    channel: event.channel,
    purpose: event.purpose,
    contentHash: event.contentHash,
    approval: { ...approval },
    result: { ...event.result },
  };
  return { entries: [...entries, entry], entry };
}
