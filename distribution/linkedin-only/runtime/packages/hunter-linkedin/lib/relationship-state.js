import { canonicalLinkedInProfileUrl } from './profile-url.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function latestIso(values) {
  const valid = values
    .filter(Boolean)
    .map(value => ({ value, time: Date.parse(value) }))
    .filter(item => Number.isFinite(item.time))
    .sort((a, b) => b.time - a.time);
  return valid[0]?.value || null;
}

export function canonicalProfileUrl(value) {
  return canonicalLinkedInProfileUrl(value);
}

function rowProfileUrl(row) {
  return row?.profileUrl || row?.participantProfileUrl || row?.url || '';
}

function findByProfileUrl(rows, profileKey) {
  return asArray(rows).find(row => canonicalProfileUrl(rowProfileUrl(row)) === profileKey) || null;
}

function actionSet(profile) {
  return new Set(asArray(profile?.actions).map(action => String(action).trim().toLowerCase()));
}

export function resolveRelationshipState(input = {}) {
  const profileUrl = input?.candidate?.profileUrl || '';
  const profileKey = canonicalProfileUrl(profileUrl);
  if (!profileKey) throw new Error('必须提供候选人主页的精确 LinkedIn URL');

  const connection = findByProfileUrl(input.connections, profileKey);
  const invitation = findByProfileUrl(input.sentInvitations, profileKey);
  const conversation = findByProfileUrl(input.conversations, profileKey);
  const profile = input.profile || {};
  const actions = actionSet(profile);
  const warnings = [];

  const isConnected = Boolean(connection || profile.isConnected === true);
  const invitationPending = !isConnected && Boolean(invitation || profile.invitationPending === true);
  const hasConversation = Boolean(conversation || profile.hasConversation === true);
  const messageActionVisible = actions.has('message') || actions.has('发消息');
  const canMessage = Boolean(isConnected || hasConversation || profile.canDirectMessage === true);

  let canConnect = false;
  if (profile.shapeSupported === false) {
    canConnect = null;
    warnings.push('profile_shape_unsupported');
  } else if (!isConnected && !invitationPending) {
    canConnect = Boolean(profile.canConnect === true || actions.has('connect') || actions.has('建立联系'));
  }

  let status = 'not_connected';
  if (isConnected) status = 'connected';
  else if (invitationPending) status = 'invitation_pending';
  else if (hasConversation) status = 'existing_conversation';
  else if (canConnect === null && !canMessage) status = 'unknown';

  const observedAt = latestIso([
    input.relationshipHint?.observedAt,
    connection?.observedAt,
    invitation?.observedAt,
    conversation?.observedAt,
    profile.observedAt,
  ]);

  return {
    candidate: {
      name: input.candidate?.name || '',
      profileUrl,
      profileKey,
    },
    status,
    connectionDegree: input.relationshipHint?.connectionDegree || profile.connectionDegree || null,
    isConnected,
    invitationPending,
    hasConversation,
    messageActionVisible,
    canMessage,
    canConnect,
    observedAt,
    evidence: {
      connection: connection ? 'connections' : (profile.isConnected === true ? 'profile' : null),
      invitation: invitation ? 'sent-invitations' : (profile.invitationPending === true ? 'profile' : null),
      conversation: conversation ? 'conversations' : (profile.hasConversation === true ? 'profile' : null),
      actions: [...actions],
    },
    warnings,
  };
}
