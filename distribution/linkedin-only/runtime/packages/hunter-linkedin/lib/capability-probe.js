import { canonicalProfileUrl } from './relationship-state.js';

const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

function includesAny(values, patterns) {
  return values.some(value => patterns.some(pattern => pattern.test(value)));
}

export function buildCapabilitySnapshot(observation = {}, expected = {}) {
  const requestedKey = canonicalProfileUrl(expected.profileUrl);
  const observedKey = canonicalProfileUrl(observation.profileUrl);
  if (!requestedKey || requestedKey !== observedKey) throw new Error('能力探测页面与候选人精确主页不一致');

  const expectedName = text(expected.expectedName).toLowerCase();
  const profileName = text(observation.profileName);
  if (!expectedName || profileName.toLowerCase() !== expectedName) throw new Error('能力探测页面与候选人姓名不一致');
  if (observation.shapeSupported !== true) throw new Error('候选人顶部动作区页面形态不受支持');

  const navLinks = (observation.navLinks || []).map(text);
  const topActions = (observation.topActions || []).map(text);
  const moreActions = (observation.moreActions || []).map(text);
  const allActions = [...topActions, ...moreActions];
  const authenticated = observation.authRequired !== true && profileName.length > 0;
  const directConnectVisible = includesAny(topActions, [/^connect$/i, /^建立联系$/]);
  const connectInMoreMenu = includesAny(moreActions, [/^connect$/i, /^建立联系$/]);
  const invitationPending = includesAny(allActions, [/^pending$/i, /invitation pending/i, /^待处理$/]);
  const messageVisible = includesAny(topActions, [/^message$/i, /^发消息$/]);
  const inMailVisible = includesAny(allActions, [/inmail/i]);

  return {
    schemaVersion: 1,
    source: 'hunter-linkedin/capability-probe',
    observedAt: observation.observedAt || new Date().toISOString(),
    session: {
      authenticated,
      searchAvailable: Boolean(observation.searchAvailable),
      connectionsAvailable: navLinks.some(value => /\/mynetwork|my network|我的人脉/i.test(value)),
      inboxAvailable: navLinks.some(value => /\/messaging|messaging|消息/i.test(value)),
      salesNavigatorAvailable: navLinks.some(value => /\/sales\b|sales navigator/i.test(value)),
      recruiterAvailable: navLinks.some(value => /\/talent\b|recruiter/i.test(value)),
    },
    candidate: {
      name: profileName,
      profileUrl: expected.profileUrl,
      profileKey: requestedKey,
      connectionDegree: text(observation.connectionDegree) || null,
      connectEntry: invitationPending ? 'pending' : directConnectVisible ? 'profile_button' : connectInMoreMenu ? 'more_menu' : 'not_observed',
      messageEntry: messageVisible ? 'profile_button' : 'not_observed',
      inMailVisible,
      invitationPending,
      moreMenuObserved: Boolean(observation.moreMenuObserved),
    },
    warnings: [
      ...(!authenticated ? ['authentication_required'] : []),
      ...(observation.moreMenuAvailable && !observation.moreMenuObserved ? ['more_menu_not_observed'] : []),
    ],
    advisoryOnly: true,
    executionAllowed: false,
  };
}
