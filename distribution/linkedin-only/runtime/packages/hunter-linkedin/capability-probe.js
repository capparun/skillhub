import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { buildCapabilitySnapshot } from './lib/capability-probe.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function inspectProfile(page, expectedName) {
  return page.evaluate(expected => {
    const visible = element => Boolean(element && element.getClientRects().length);
    const normalized = value => String(value || '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main') || document.body;
    const heading = [...main.querySelectorAll('h1,h2')]
      .find(element => visible(element) && normalized(element.textContent).toLowerCase() === normalized(expected).toLowerCase());
    const topCard = heading?.closest('[id*="Topcard"]')?.querySelector('section') || heading?.closest('section') || null;
    const actionElements = topCard ? [...topCard.querySelectorAll('a,button')].filter(visible) : [];
    const actionText = element => normalized(element.innerText || element.textContent || element.getAttribute('aria-label'));
    const globalNav = document.querySelector('[data-testid="primary-nav"]') || document.querySelector('#global-nav') || document.querySelector('header');
    const links = [...(globalNav?.querySelectorAll('a') || [])].filter(visible)
      .map(element => `${normalized(element.textContent)} ${element.getAttribute('href') || ''}`);
    const pageText = normalized(document.body?.innerText);
    return {
      profileUrl: location.href,
      profileName: normalized(heading?.textContent),
      shapeSupported: Boolean(topCard),
      connectionDegree: [...(topCard?.querySelectorAll('p,span') || [])].map(element => normalized(element.textContent))
        .find(value => /^(·\s*)?(1st|2nd|3rd\+?|1\s*度|2\s*度|3\s*度\+?)$/i.test(value)) || '',
      topActions: actionElements.map(actionText).filter(Boolean),
      navLinks: links,
      searchAvailable: Boolean([...document.querySelectorAll('[aria-label],input')].find(element => visible(element) && /search|搜索/i.test(element.getAttribute('aria-label') || element.getAttribute('placeholder') || ''))),
      moreMenuAvailable: actionElements.some(element => element.tagName === 'BUTTON' && /^more$/i.test(element.getAttribute('aria-label') || actionText(element))),
      authRequired: /linkedin\.com\/(login|checkpoint|authwall)/i.test(location.href) || /verification required|sign in to linkedin/i.test(pageText),
    };
  }, expectedName);
}

async function inspectMoreMenu(page, expectedName) {
  return page.evaluate(async expected => {
    const visible = element => Boolean(element && element.getClientRects().length);
    const normalized = value => String(value || '').replace(/\s+/g, ' ').trim();
    const main = document.querySelector('main') || document.body;
    const heading = [...main.querySelectorAll('h1,h2')]
      .find(element => visible(element) && normalized(element.textContent).toLowerCase() === normalized(expected).toLowerCase());
    const topCard = heading?.closest('[id*="Topcard"]')?.querySelector('section') || heading?.closest('section') || null;
    if (!topCard) return { moreMenuObserved: false, moreActions: [] };
    const button = [...topCard.querySelectorAll('button')].find(element => visible(element) && /^more$/i.test(element.getAttribute('aria-label') || (element.textContent || '').trim()));
    if (!button) return { moreMenuObserved: false, moreActions: [] };
    const previouslyVisible = new Set([...document.querySelectorAll('[role="menu"], [role="listbox"]')].filter(visible));
    const controlledId = button.getAttribute('aria-controls');
    button.click();
    await new Promise(resolve => setTimeout(resolve, 350));
    const controlled = controlledId ? document.getElementById(controlledId) : null;
    const menu = controlled && visible(controlled) ? controlled
      : [...document.querySelectorAll('[role="menu"], [role="listbox"]')].find(element => visible(element) && !previouslyVisible.has(element));
    const moreActions = [...(menu?.querySelectorAll('a,button,[role="menuitem"]') || [])]
      .filter(visible)
      .map(element => String(element.innerText || element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (button.getAttribute('aria-expanded') === 'true') button.click();
    return { moreMenuObserved: Boolean(menu), moreActions };
  }, expectedName);
}

export async function executeCapabilityProbe(page, args) {
  await page.goto(args.profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  const base = await inspectProfile(page, args.expectedName);
  if (base.authRequired) throw new AuthRequiredError('www.linkedin.com', 'LinkedIn capability-probe requires an active signed-in browser session');
  const menu = base.moreMenuAvailable && base.shapeSupported ? await inspectMoreMenu(page, args.expectedName) : { moreMenuObserved: false, moreActions: [] };
  let snapshot;
  try {
    snapshot = buildCapabilitySnapshot({ ...base, ...menu, observedAt: new Date().toISOString() }, args);
  } catch (error) {
    throw new CommandExecutionError(`LinkedIn capability-probe blocked: ${error.message}`);
  }
  return [{
    authenticated: snapshot.session.authenticated,
    searchAvailable: snapshot.session.searchAvailable,
    connectionsAvailable: snapshot.session.connectionsAvailable,
    inboxAvailable: snapshot.session.inboxAvailable,
    profileUrl: snapshot.candidate.profileUrl,
    profileName: snapshot.candidate.name,
    connectionDegree: snapshot.candidate.connectionDegree || '',
    connectEntry: snapshot.candidate.connectEntry,
    messageEntry: snapshot.candidate.messageEntry,
    invitationPending: snapshot.candidate.invitationPending,
    inMailVisible: snapshot.candidate.inMailVisible,
    advisoryOnly: true,
    executionAllowed: false,
    snapshotJson: JSON.stringify(snapshot),
  }];
}

cli({
  site: 'hunter-linkedin', name: 'capability-probe', access: 'read',
  description: '只读探测当前 LinkedIn 会话与精确候选人页面的 Connect、Message 等可见能力。',
  domain: 'www.linkedin.com', browser: true, strategy: Strategy.UI, siteSession: 'ephemeral',
  args: [
    { name: 'profileUrl', type: 'string', required: true, positional: true, description: '候选人的精确 LinkedIn 主页 URL' },
    { name: 'expectedName', type: 'string', required: true, description: '主页标题必须精确匹配的候选人姓名' },
  ],
  columns: ['authenticated', 'searchAvailable', 'connectionsAvailable', 'inboxAvailable', 'profileUrl', 'profileName', 'connectionDegree', 'connectEntry', 'messageEntry', 'invitationPending', 'inMailVisible', 'advisoryOnly', 'executionAllowed', 'snapshotJson'],
  func: executeCapabilityProbe,
});
