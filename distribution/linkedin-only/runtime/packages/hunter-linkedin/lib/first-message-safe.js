import { canonicalProfileUrl } from './relationship-state.js';

const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

export function prepareFirstMessageRequest(input = {}) {
  const profileUrl = String(input.profileUrl || '').trim();
  const profileKey = canonicalProfileUrl(profileUrl);
  const expectedName = String(input.expectedName || '').trim();
  const message = String(input.message || '').trim();
  if (!profileKey) throw new Error('必须提供精确 LinkedIn 主页 URL');
  if (!expectedName) throw new Error('必须提供预期收件人姓名');
  if (!message) throw new Error('消息内容不能为空');
  const request = { profileUrl, profileKey, expectedName, message, messageChars: [...message].length, send: input.send === true };
  if (request.send) {
    const approval = input.approval || {};
    if (approval.approved !== true || approval.source !== 'current_conversation') throw new Error('真实发送缺少当前对话人工审批');
    if (canonicalProfileUrl(approval.profileUrl || '') !== profileKey || approval.channel !== 'linkedin_message' || approval.content !== message) {
      throw new Error('人工审批与待发送消息不一致');
    }
  }
  return request;
}

export function validateFirstMessageCompose(state = {}, request = {}) {
  if (!norm(state.recipientName)) return { valid: false, reason: 'recipient_not_ready' };
  if (norm(state.recipientName) !== norm(request.expectedName)) return { valid: false, reason: 'recipient_mismatch' };
  if (!/\b1st\b/i.test(`${state.connectionDegree || ''} ${state.pageText || ''}`)) return { valid: false, reason: 'not_first_degree' };
  if (!state.editorVisible || !state.sendButtonVisible) return { valid: false, reason: 'compose_controls_missing' };
  return { valid: true, reason: 'compose_ready' };
}

export function verifyFirstMessageOutcome(state = {}, request = {}) {
  if (!/\/messaging\/thread\//.test(String(state.threadUrl || ''))) {
    return { verified: false, reason: 'thread_not_ready' };
  }
  if (norm(state.recipientName) !== norm(request.expectedName)) {
    return { verified: false, reason: 'recipient_not_verified' };
  }
  if (norm(state.latestOutgoingText) !== norm(request.message)) {
    return { verified: false, reason: 'message_not_verified' };
  }
  if (norm(state.editorText)) {
    return { verified: false, reason: 'editor_not_cleared' };
  }
  return { verified: true, reason: 'thread_message_verified' };
}
