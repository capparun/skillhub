import { canonicalProfileUrl } from './relationship-state.js';

export function buildOutreachPlan(input = {}) {
  const profileUrl = input.candidate?.profileUrl || '';
  const profileKey = canonicalProfileUrl(profileUrl);
  if (!profileKey) throw new Error('必须提供候选人主页的精确 LinkedIn URL');

  const state = input.relationshipState || {};
  const hasEmail = Boolean(String(input.verifiedEmail || '').trim());
  let primaryChannel = 'pause';
  let reason = '暂无已确认可用的触达渠道';

  if (state.isConnected || state.hasConversation || state.canMessage) {
    primaryChannel = 'linkedin_message';
    reason = state.hasConversation ? '已存在 LinkedIn 会话' : '已连接或已确认可直接发消息';
  } else if (state.invitationPending) {
    primaryChannel = 'wait';
    reason = 'Connect 邀请已发出，等待候选人处理';
  } else if (state.canConnect === true) {
    primaryChannel = 'connect';
    reason = '尚未连接且已确认可发送 Connect';
  } else if (hasEmail) {
    primaryChannel = 'email_draft';
    reason = '存在已验证邮箱，首版仅生成邮件草稿';
  }

  const alternativeChannels = [];
  if (hasEmail && primaryChannel !== 'email_draft' && primaryChannel !== 'wait') alternativeChannels.push('email_draft');

  const approval = input.candidateApproval || {};
  const approvalValid = approval.approved === true
    && approval.source === 'current_conversation'
    && Number.isFinite(Date.parse(approval.approvedAt || ''))
    && canonicalProfileUrl(approval.profileUrl || '') === profileKey;

  return {
    candidate: { name: input.candidate?.name || '', profileUrl, profileKey },
    primaryChannel,
    alternativeChannels,
    reason,
    relationshipObservedAt: state.observedAt || null,
    candidateApproval: approvalValid
      ? {
          status: 'approved',
          approvedAt: approval.approvedAt,
          source: approval.source,
          profileUrl: approval.profileUrl,
        }
      : { status: 'required' },
    draftStatus: primaryChannel === 'wait' || primaryChannel === 'pause' ? 'not_applicable' : 'required',
    contentApproval: { status: 'not_ready' },
    executionAllowed: false,
  };
}
