import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { buildThreadSnapshot, canonicalizeThreadUrl, normalizeWhitespace, parseMaxScrolls } from './lib/thread-snapshot.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function inspectionScript(maxScrolls) {
  return `(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const visible = element => Boolean(element && element.getClientRects().length);
    const thread = [...document.querySelectorAll('[id^="message-thread-"]')].find(visible);
    const header = thread?.querySelector('#thread-detail-jump-target');
    const list = thread?.querySelector('[id^="message-list-"]');
    let previousHeight = -1, stable = 0, attempts = 0;
    for (let index = 0; list && index < ${maxScrolls}; index += 1) {
      attempts += 1; list.scrollTop = 0; await sleep(750);
      const height = list.scrollHeight || 0;
      stable = height === previousHeight ? stable + 1 : 0; previousHeight = height;
      if (stable >= 3) break;
    }
    const messages = [...(list?.querySelectorAll('li') || [])]
      .filter(item => visible(item) && item.querySelector('p'))
      .map(item => ({
        speaker: [...item.querySelectorAll('a[href*="/in/"] span')]
          .map(element => element.innerText.trim())
          .find(name => name && !/^View .+ profile$/i.test(name)) || '',
        text: item.querySelector('p')?.innerText || '',
        timestamp: item.querySelector('time')?.innerText || '',
      }));
    const bodyText = document.body?.innerText || '';
    return {
      url: location.href,
      headerName: header?.querySelector('h2')?.innerText || '',
      headerProfileUrl: header?.querySelector('a[href*="/in/"]')?.href || '',
      messages,
      stable: ${maxScrolls} === 0 ? true : stable >= 3,
      authRequired: /linkedin\\.com\\/(login|checkpoint|authwall)/i.test(location.href) || /captcha|verification required/i.test(bodyText),
    };
  })()`;
}

export async function executeThreadSnapshot(page, args) {
  const threadUrl = canonicalizeThreadUrl(args.threadUrl);
  const expectedName = normalizeWhitespace(args.expectedName);
  const maxScrolls = parseMaxScrolls(args.maxScrolls);
  await page.goto(threadUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2500);
  const observation = await page.evaluate(inspectionScript(maxScrolls));
  if (observation?.authRequired) throw new AuthRequiredError('www.linkedin.com', 'LinkedIn thread-snapshot requires an active signed-in browser session');
  if (canonicalizeThreadUrl(observation?.url || '') !== threadUrl) throw new CommandExecutionError('LinkedIn thread-snapshot blocked: thread_url_mismatch');
  if (maxScrolls >= 4 && !observation.stable) throw new CommandExecutionError('LinkedIn thread history did not stabilize before maxScrolls');
  const snapshot = buildThreadSnapshot(observation, expectedName);
  const latestText = snapshot.messages.at(-1)?.text || '';
  return [{
    threadUrl, recipient: snapshot.recipient, profileUrl: snapshot.profileUrl,
    messageCount: snapshot.messages.length, latestText,
    snapshotJson: JSON.stringify({ threadUrl, ...snapshot, extractedAt: new Date().toISOString(), source: 'hunter-linkedin-visible-thread' }),
  }];
}

cli({
  site: 'hunter-linkedin', name: 'thread-snapshot', access: 'read',
  description: '从精确 LinkedIn 会话页面读取可见线程快照，不修改官方 OpenCLI。',
  domain: 'www.linkedin.com', browser: true, strategy: Strategy.UI, siteSession: 'ephemeral',
  args: [
    { name: 'threadUrl', type: 'string', required: true, positional: true, description: '精确 LinkedIn 消息线程 URL' },
    { name: 'expectedName', type: 'string', required: true, description: '线程标题必须精确匹配的候选人姓名' },
    { name: 'maxScrolls', type: 'int', default: 30, description: '向上加载历史消息的最大次数，范围 0–80' },
  ],
  columns: ['threadUrl', 'recipient', 'profileUrl', 'messageCount', 'latestText', 'snapshotJson'],
  func: executeThreadSnapshot,
});
