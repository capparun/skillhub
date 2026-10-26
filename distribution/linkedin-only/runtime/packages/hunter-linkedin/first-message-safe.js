import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import path from 'node:path';
import {
  prepareFirstMessageRequest,
  validateFirstMessageCompose,
  verifyFirstMessageOutcome,
} from './lib/first-message-safe.js';
import { readJsonFile } from './lib/json-file.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const loadApproval = file => file ? readJsonFile(path.resolve(file)) : null;

async function inspectCompose(page) {
  return page.evaluate(() => {
    const visible = element => Boolean(element && element.getClientRects().length);
    const remove = [...document.querySelectorAll('button[aria-label^="Remove "]')].find(visible);
    const recipientName = (remove?.getAttribute('aria-label') || '').replace(/^Remove\s+/, '').trim();
    const profile = [...document.querySelectorAll('a[href*="/in/"]')]
      .find(link => visible(link) && (link.textContent || '').trim() === recipientName);
    const container = profile?.closest('div');
    const pageText = document.body.innerText || '';
    const degree = container?.parentElement?.innerText || pageText;
    const editor = [...document.querySelectorAll('[contenteditable="true"][role="textbox"]')].find(visible);
    const send = [...document.querySelectorAll('button[type="submit"]')]
      .find(button => visible(button) && (button.textContent || '').trim() === 'Send');
    return {
      recipientName,
      connectionDegree: /1st degree connection/i.test(degree) ? '1st degree connection' : '',
      pageText,
      editorVisible: Boolean(editor),
      sendButtonVisible: Boolean(send),
    };
  });
}

async function inspectSentMessage(page) {
  return page.evaluate(() => {
    const visible = element => Boolean(element && element.getClientRects().length);
    const thread = [...document.querySelectorAll('[id^="message-thread-"]')].find(visible);
    const recipientName = (thread?.querySelector('h2')?.textContent || '').trim();
    const messages = [...(thread?.querySelectorAll('[id^="message-list-"] li') || [])];
    const latest = messages.reverse().find(item => visible(item) && item.querySelector('p'));
    const editor = [...document.querySelectorAll('[contenteditable="true"][role="textbox"]')].find(visible);
    return {
      threadUrl: window.location.href,
      recipientName,
      latestOutgoingText: (latest?.querySelector('p')?.innerText || '').trim(),
      editorText: (editor?.innerText || editor?.textContent || '').trim(),
    };
  });
}

export async function executeFirstMessageSafe(page, args) {
  const request = prepareFirstMessageRequest({ ...args, approval: loadApproval(args.approval) });
  await page.goto(request.profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1200);
  const composeUrl = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a[href^="/messaging/compose/"]')]
      .find(element => element.getClientRects().length && new URL(element.href).searchParams.has('recipient'));
    if (!link) return '';
    const url = new URL(link.href);
    url.searchParams.delete('interop');
    return url.href;
  });
  if (!composeUrl) throw new Error('目标主页没有可用的首次消息入口');

  await page.goto(composeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let state = {};
  let validation = { valid: false, reason: 'compose_not_ready' };
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(500);
    state = await inspectCompose(page);
    validation = validateFirstMessageCompose(state, request);
    if (validation.valid || validation.reason === 'recipient_mismatch') break;
  }
  if (!validation.valid) throw new Error(`首次消息安全校验失败: ${validation.reason}`);

  const editorSelector = '[contenteditable="true"][role="textbox"]';
  const input = await page.fillText(editorSelector, request.message);
  if (!input?.filled || !input?.verified || input.actual !== request.message) {
    throw new Error('消息草稿未能通过 OpenCLI 真实输入校验');
  }
  let sendReady = false;
  for (let attempt = 0; attempt < 10 && !sendReady; attempt++) {
    await sleep(300);
    sendReady = await page.evaluate(() => {
      const send = [...document.querySelectorAll('button[type="submit"]')]
        .find(button => button.getClientRects().length && (button.textContent || '').trim() === 'Send');
      return Boolean(send && !send.disabled);
    });
  }
  if (!sendReady) throw new Error('消息草稿已填入，但发送按钮未启用');

  if (!request.send) return [{ status: 'draft_ready', recipient: state.recipientName, messageChars: request.messageChars, sent: false }];

  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button[type="submit"]')]
      .find(item => item.getClientRects().length && (item.textContent || '').trim() === 'Send');
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error('发送按钮不存在，未执行外部操作');
  let outcome = { verified: false, reason: 'thread_not_ready' };
  for (let attempt = 0; attempt < 12 && !outcome.verified; attempt++) {
    await sleep(500);
    outcome = verifyFirstMessageOutcome(await inspectSentMessage(page), request);
  }
  return [{
    status: outcome.verified ? 'success' : 'uncertain',
    recipient: state.recipientName,
    messageChars: request.messageChars,
    sent: outcome.verified,
  }];
}

cli({
  site: 'hunter-linkedin', name: 'first-message-safe', access: 'write',
  description: '向新建立的一度连接创建首条消息；默认只填草稿，审批后才发送。',
  domain: 'www.linkedin.com', browser: true, strategy: Strategy.UI, siteSession: 'ephemeral',
  args: [
    { name: 'profileUrl', type: 'string', required: true, positional: true, description: '收件人的精确 LinkedIn 主页 URL' },
    { name: 'expectedName', type: 'string', required: true, description: '消息页必须精确匹配的收件人姓名' },
    { name: 'message', type: 'string', required: true, description: '经人工审阅的完整消息内容' },
    { name: 'send', type: 'boolean', default: false, description: '默认 false；true 时才点击发送' },
    { name: 'approval', type: 'string', default: '', description: '真实发送所需的当前对话审批 JSON 文件' },
  ],
  columns: ['status', 'recipient', 'messageChars', 'sent'],
  func: executeFirstMessageSafe,
});
