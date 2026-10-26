import { canonicalProfileUrl } from './relationship-state.js';

function normalizedText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildConnectInviteUrl(profileUrl) {
  const profileKey = canonicalProfileUrl(profileUrl);
  if (!profileKey) throw new Error('必须提供候选人的精确 LinkedIn 主页 URL');
  const vanityName = profileKey.split('/').pop();
  return `https://www.linkedin.com/preload/custom-invite/?vanityName=${encodeURIComponent(vanityName)}`;
}

function validateApproval(approval, request) {
  if (
    approval?.approved !== true
    || approval.source !== 'current_conversation'
    || !Number.isFinite(Date.parse(approval.approvedAt || ''))
  ) {
    throw new Error('真实发送缺少当前对话中的有效人工审批');
  }
  if (canonicalProfileUrl(approval.profileUrl || '') !== request.profileKey) {
    throw new Error('人工审批的候选人主页与发送目标不一致');
  }
  if (approval.channel !== 'connect') throw new Error('人工审批的渠道必须是 connect');
  if (String(approval.content ?? '') !== request.note) throw new Error('人工审批内容与邀请附言不一致');
}

export function prepareConnectRequest(input = {}) {
  const profileUrl = String(input.profileUrl || '').trim();
  const expectedName = String(input.expectedName || '').trim();
  const note = String(input.note ?? '');
  const profileKey = canonicalProfileUrl(profileUrl);
  if (!profileKey) throw new Error('必须提供候选人的精确 LinkedIn 主页 URL');
  if (!expectedName) throw new Error('必须提供候选人的预期姓名');
  if ([...note].length > 200) throw new Error('LinkedIn 邀请附言不能超过 200 个字符');

  const request = {
    profileUrl,
    profileKey,
    expectedName,
    note,
    noteLength: [...note].length,
    send: input.send === true,
    inviteUrl: buildConnectInviteUrl(profileUrl),
  };
  if (request.send) validateApproval(input.approval, request);
  return request;
}

export function validateConnectDialog(dialog = {}, expectedName) {
  if (!dialog.dialogVisible || !dialog.sendButtonVisible) {
    return { valid: false, reason: 'invite_dialog_not_found' };
  }
  const actual = normalizedText(dialog.recipientName);
  const expected = normalizedText(expectedName);
  const dialogText = normalizedText(dialog.dialogText);
  const namedInInvitationCopy = dialogText.includes(`invitation to ${expected} by adding a note`);
  if ((!actual || actual !== expected) && !namedInInvitationCopy) {
    return { valid: false, reason: 'recipient_mismatch' };
  }
  return { valid: true, reason: 'ready' };
}

export function validatePendingInvitation(observation = {}, request = {}) {
  if (canonicalProfileUrl(observation.profileUrl || '') !== canonicalProfileUrl(request.profileUrl || '')) {
    return { valid: false, reason: 'profile_url_mismatch' };
  }
  const expected = normalizedText(request.expectedName);
  const labels = Array.isArray(observation.pendingLabels) ? observation.pendingLabels : [];
  if (labels.length === 0) return { valid: false, reason: 'pending_not_found' };
  const matched = labels.some(label => {
    const normalized = normalizedText(label);
    return normalized === `pending, click to withdraw invitation sent to ${expected}`
      || normalized === `pending invitation sent to ${expected}`;
  });
  return matched
    ? { valid: true, reason: 'pending_verified' }
    : { valid: false, reason: 'pending_target_mismatch' };
}
