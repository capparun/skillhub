import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import path from 'node:path';
import { prepareConnectRequest, validateConnectDialog, validatePendingInvitation } from './lib/connect-safe.js';
import { readJsonFile } from './lib/json-file.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadApproval(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`审批文件不存在: ${resolved}`);
  return readJsonFile(resolved);
}

async function inspectDialog(page) {
  return page.evaluate(() => {
    const visible = element => Boolean(element && element.getClientRects().length);
    const dialog = [...document.querySelectorAll('[role="dialog"], dialog')].find(visible);
    if (!dialog) return {
      dialogVisible: false, heading: '', recipientName: '',
      sendButtonVisible: false, addNoteButtonVisible: false,
    };
    const buttons = [...dialog.querySelectorAll('button')].filter(visible);
    const buttonText = button => (button.innerText || button.textContent || '').trim();
    const profileLink = [...dialog.querySelectorAll('a[href*="/in/"]')]
      .find(link => (link.innerText || link.textContent || '').trim());
    const image = dialog.querySelector('img[alt]');
    return {
      dialogVisible: true,
      heading: (dialog.querySelector('h1,h2,h3,[role="heading"]')?.textContent || '').trim(),
      recipientName: (profileLink?.textContent || image?.getAttribute('alt') || '').trim(),
      dialogText: (dialog.innerText || dialog.textContent || '').trim(),
      sendButtonVisible: buttons.some(button => /^(send|发送|send without a note)$/i.test(buttonText(button))),
      addNoteButtonVisible: buttons.some(button => /^(add a note|添加附言)$/i.test(buttonText(button))),
    };
  });
}

async function clickDialogButton(page, patternSource) {
  return page.evaluate(source => {
    const pattern = new RegExp(source, 'i');
    const dialog = [...document.querySelectorAll('[role="dialog"], dialog')]
      .find(element => element.getClientRects().length);
    const button = [...(dialog?.querySelectorAll('button') || [])]
      .find(item => pattern.test((item.innerText || item.textContent || '').trim()));
    if (!button) return false;
    button.click();
    return true;
  }, patternSource);
}

async function fillNote(page, note) {
  const opened = await clickDialogButton(page, '^(add a note|添加附言)$');
  if (!opened) throw new Error('LinkedIn 邀请弹窗中未找到“添加附言”按钮');
  await sleep(500);
  const filled = await page.evaluate(value => {
    const dialog = [...document.querySelectorAll('[role="dialog"], dialog')]
      .find(element => element.getClientRects().length);
    const input = dialog?.querySelector('textarea');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === value;
  }, note);
  if (!filled) throw new Error('LinkedIn 邀请附言未能可靠写入');
}

async function inspectPendingProfile(page, request) {
  await page.goto(request.profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  const observation = await page.evaluate(() => ({
    profileUrl: window.location.href,
    pendingLabels: [...document.querySelectorAll('[aria-label*="Pending"]')]
      .map(element => element.getAttribute('aria-label'))
      .filter(Boolean),
  }));
  return validatePendingInvitation(observation, request);
}

async function closeDryRunDialog(page, noteWasFilled) {
  if (noteWasFilled) {
    await clickDialogButton(page, '^(cancel adding a note|取消添加附言|cancel)$');
    await sleep(300);
  }
  await clickDialogButton(page, '^(dismiss|close|取消|关闭)$');
}

export async function executeConnectSafe(page, rawArgs) {
  const request = prepareConnectRequest({
    ...rawArgs,
    approval: loadApproval(rawArgs.approval),
  });
  await page.goto(request.inviteUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);

  const before = await inspectDialog(page);
  const validation = validateConnectDialog(before, request.expectedName);
  if (!validation.valid) throw new Error(`Connect 安全校验失败: ${validation.reason}`);

  if (request.note) await fillNote(page, request.note);
  if (!request.send) {
    await closeDryRunDialog(page, Boolean(request.note));
    return [{
      status: 'dry_run_ready', profileUrl: request.profileUrl,
      recipientName: before.recipientName || request.expectedName, noteLength: request.noteLength,
      verifiedState: 'invite_dialog', sent: false,
    }];
  }

  const finalState = await inspectDialog(page);
  const finalValidation = validateConnectDialog(finalState, request.expectedName);
  if (!finalValidation.valid) throw new Error(`发送前最终校验失败: ${finalValidation.reason}`);
  const sent = await clickDialogButton(page, request.note ? '^(send|发送)$' : '^(send without a note|send|发送)$');
  if (!sent) throw new Error('发送按钮不存在，未执行任何外部操作');
  await sleep(1200);
  const pending = await inspectPendingProfile(page, request);
  return [{
    status: pending.valid ? 'success' : 'uncertain',
    profileUrl: request.profileUrl, recipientName: before.recipientName || request.expectedName,
    noteLength: request.noteLength, verifiedState: pending.reason, sent: pending.valid,
  }];
}

cli({
  site: 'hunter-linkedin',
  name: 'connect-safe',
  access: 'write',
  description: '在真实 LinkedIn 邀请弹窗中核验收件人；默认仅演练，人工审批后才可发送。',
  domain: 'www.linkedin.com',
  browser: true,
  strategy: Strategy.UI,
  siteSession: 'ephemeral',
  args: [
    { name: 'profileUrl', type: 'string', required: true, positional: true, description: '候选人的精确 LinkedIn 主页 URL' },
    { name: 'expectedName', type: 'string', required: true, description: '弹窗中必须精确匹配的候选人姓名' },
    { name: 'note', type: 'string', default: '', description: '可选邀请附言，最多 200 字符' },
    { name: 'send', type: 'boolean', default: false, description: '默认 false；true 时才允许点击发送' },
    { name: 'approval', type: 'string', default: '', description: '真实发送所需的当前对话人工审批 JSON 文件' },
  ],
  columns: ['status', 'profileUrl', 'recipientName', 'noteLength', 'verifiedState', 'sent'],
  func: executeConnectSafe,
});
