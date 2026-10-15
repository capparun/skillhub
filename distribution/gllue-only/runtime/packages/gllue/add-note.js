// add-note：在候选人详情页写入一条「快捷备注」。
// 快捷备注的选项是租户后台配置的可点标签（2026-10-04 探针实测：面板内无输入框、
// 无提交按钮，rlt-tag-clickable 标签单击即产生备注），因此：
// - 选项永远运行时枚举，代码不写死任何备注文本
// - 点标签是唯一写动作，走与 update-candidate 同一套授权契约
// （15 分钟、绑定候选人/租户/文本/内容哈希、一次授权一次点击、uncertain 不自动重试）
import { cli, Strategy } from '@jackwener/opencli/registry';
import { GllueClient } from './lib/gllue-client.js';
import { hardGoto } from './lib/navigation.js';
import { buildUrl, getConfig } from './lib/auth.js';
import { randomDelay } from './lib/utils.js';
import { claimWriteApprovalOnce, readFreshApproval, stableHash } from './lib/write-approval.js';

export function noteContentHash({ action, candidateId, origin, text }) {
  return stableHash({ action, candidateId, origin, text });
}

// 「快捷备注」tab 的 rc-tabs id 前缀是动态的（rc-tabs-0-…），按 id 子串或文本匹配
export async function openQuickNotePanel(page, { delay = randomDelay } = {}) {
  await page.evaluate(() => {
    const tab = document.querySelector('[id*="tab-note_quick_add_type"]') ||
      [...document.querySelectorAll('.rlt-tabs-tab-btn')]
        .find(el => /快捷备注/.test(el.textContent || ''));
    tab?.scrollIntoView?.({ block: 'center' });
    tab?.click();
  });
  await delay([600, 900]);
}

export async function listQuickNoteOptions(page) {
  return page.evaluate(() => {
    const visible = node => node.getClientRects().length > 0;
    const scope = document.querySelector('[id*="panel-note_quick_add_type"]') || document;
    const titles = [...scope.querySelectorAll('.rlt-tag-clickable .rlt-tag-content-wrapper[title]')]
      .filter(visible)
      .map(el => (el.getAttribute('title') || '').trim())
      .filter(Boolean);
    return [...new Set(titles)];
  });
}

async function markNoteTag(page, text) {
  return page.evaluate((target) => {
    const visible = node => node.getClientRects().length > 0;
    document.querySelectorAll('[data-opencli-note-tag]')
      .forEach(el => el.removeAttribute('data-opencli-note-tag'));
    const scope = document.querySelector('[id*="panel-note_quick_add_type"]') || document;
    const matches = [...scope.querySelectorAll('.rlt-tag-clickable .rlt-tag-content-wrapper[title]')]
      .filter(el => visible(el) && (el.getAttribute('title') || '').trim() === target);
    if (matches.length !== 1) return false;
    (matches[0].closest('.rlt-tag-clickable') || matches[0])
      .setAttribute('data-opencli-note-tag', '');
    return true;
  }, text);
}

// 回读只看备注记录区：快捷备注面板里的标签自带同样的文本，必须排除，
// 否则未写入也会误判成功。记录容器是 note$content 等 note$ 系 data-test
//（get-candidate 读联系记录同通道）。
// 备注记录区的条数基线：写入是否落库以「记录条数增加」为准。
// 2026-10-04 验收实测：标签 onClick 存的是标签的英文翻译
//（content: getTrans(tag, {en:'en_US'})），按中文标签文本回读永远匹配不上；
// 记录区结构是 .card__event-border 事件卡（探针实测 5 条历史记录）。
async function countNoteRecords(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.card__event-border')]
      .filter(node => node.getClientRects().length > 0).length);
}

// 点击后即时取证：toast 文案 + 新增网络请求 + 记录条数。
// 仅只读观察，用于区分「点击未触发 React」与「请求已发出但被后端拒绝」。
async function captureClickEvidence(page, { beforeRecords, beforeResources }) {
  return page.evaluate(({ baseline, resourceBaseline }) => {
    const visible = node => node.getClientRects().length > 0;
    const toasts = ['.rlt-message-notice', '.rlt-notification-notice', '.rlt-toast',
      '.rlt-message', '.rlt-notification', '[class*="toast"]']
      .flatMap(sel => [...document.querySelectorAll(sel)].filter(visible)
        .map(el => el.textContent.trim().replace(/\s+/g, ' ').slice(0, 120)));
    const resources = performance.getEntriesByType('resource')
      .slice(resourceBaseline)
      .map(entry => entry.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 100));
    return {
      toasts: [...new Set(toasts)],
      newResources: [...new Set(resources)].slice(0, 6),
      recordCount: [...document.querySelectorAll('.card__event-border')]
        .filter(visible).length,
      recordDelta: [...document.querySelectorAll('.card__event-border')]
        .filter(visible).length - baseline
    };
  }, { baseline: beforeRecords, resourceBaseline: beforeResources });
}

async function countResources(page) {
  return page.evaluate(() => performance.getEntriesByType('resource').length);
}

async function readNoteEcho(page, text) {
  return page.evaluate((target) => {
    const visible = node => node.getClientRects().length > 0;
    return [...document.querySelectorAll('[data-test*="note"]')]
      .filter(el => visible(el) &&
        !el.closest('[id*="panel-note_quick_add_type"]') &&
        !el.closest('.rlt-tabs-tab-btn') &&
        el.getAttribute('data-test') !== 'detail-card-action:candidate$note')
      .some(el => (el.textContent || '').includes(target));
  }, text);
}

cli({
  site: 'gllue',
  name: 'add-note',
  description: '为候选人写入一条快捷备注（选项为后台配置的运行时枚举；默认 dry-run，真实写入需 --confirm 与精确授权）',
  access: 'write',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    { name: 'id', type: 'string', required: true, description: '候选人详情页数字 id（URL 的 id 参数）' },
    { name: 'text', type: 'string', required: false, description: '快捷备注标签文本，必须与运行时枚举完全一致' },
    { name: 'list', type: 'boolean', required: false, description: '只读列出当前租户配置的快捷备注选项' },
    { name: 'confirm', type: 'boolean', required: false, description: '为 true 才进入真实写入安全门；单独使用不足以授权' },
    { name: 'approval', type: 'string', required: false, description: '15 分钟内绑定候选人、租户、文本与内容哈希的授权 JSON 文件' }
  ],
  columns: ['status', 'candidateId', 'text', 'message'],
  func: async (page, kwargs) => {
    const candidateId = String(kwargs.id || '').trim();
    if (!/^\d+$/.test(candidateId)) throw new Error('候选人 id 必须是详情页 URL 里的数字 id');
    const text = String(kwargs.text || '').trim();
    const confirmed = kwargs.confirm === true || kwargs.confirm === 'true';
    const config = getConfig();
    const origin = new URL(buildUrl(config)).origin;
    const detailUrl = buildUrl(config, `/crm/candidate/detail?id=${encodeURIComponent(candidateId)}`);
    const contentHash = text
      ? noteContentHash({ action: 'add_note', candidateId, origin, text })
      : null;

    // 授权校验在页面访问之前：未通过门不触达页面
    let approval = null;
    if (confirmed) {
      if (!text) throw new Error('真实写入必须提供 --text 备注内容');
      approval = readFreshApproval(kwargs.approval, 'add_note',
        '真实写入必须提供 --approval 授权文件');
      if (String(approval.candidateId) !== candidateId) throw new Error('授权候选人与当前请求不匹配');
      if (approval.origin !== origin) throw new Error('授权租户与当前 Gllue 配置不匹配');
      if (String(approval.text || '').trim() !== text) throw new Error('授权备注内容与当前请求不匹配');
      if (approval.contentHash !== contentHash) {
        throw new Error('授权内容哈希不匹配，请重新确认');
      }
    }

    const client = new GllueClient(page);
    await client.checkAuth();
    await hardGoto(page, detailUrl);
    // 3.6.39.5 首访详情渲染慢至 8s+，锚点等待与 update-candidate 一致放宽到 30s
    await page.wait({ selector: '[data-test="detail-name:candidate"]', timeout: 30 });
    await randomDelay(config.delays.pageLoad);
    const observedUrl = await page.evaluate(() => window.location.href);
    if (observedUrl !== detailUrl) throw new Error('候选人详情页身份不匹配，拒绝操作');

    await openQuickNotePanel(page);
    const options = await listQuickNoteOptions(page);
    if (!options.length) throw new Error('未读到快捷备注选项，面板结构可能已变化，拒绝操作');

    if (kwargs.list === true || kwargs.list === 'true') {
      return { status: 'ok', candidateId, options, externalActionUpdated: false,
        message: '当前租户后台配置的快捷备注选项（运行时枚举）' };
    }
    if (!text) {
      return { status: 'dry_run', candidateId, options, externalActionUpdated: false,
        message: '未提供 --text；用 --list 查看当前可用选项' };
    }
    if (!options.includes(text)) {
      return { status: 'no_match', candidateId, text, options, externalActionUpdated: false,
        message: `快捷备注选项不存在「${text}」（当前可用: ${options.join(', ')}）` };
    }
    if (!confirmed) {
      return { status: 'dry_run', candidateId, text, contentHash, externalActionUpdated: false,
        message: '未写入；真实写入需 --confirm 与字段级授权文件' };
    }

    if (!await markNoteTag(page, text)) {
      throw new Error(`快捷备注选项「${text}」定位失败，未执行写入`);
    }
    // 点击前的只读基线（记录条数 + 已加载资源数），供点击后即时取证比对
    const beforeRecords = await countNoteRecords(page);
    const beforeResources = await countResources(page);
    // 点标签是唯一外部写动作；不自动重试
    claimWriteApprovalOnce(config.output.baseDir, config.tenant, approval);
    const tagClick = await page.click('[data-opencli-note-tag]');
    if (tagClick?.clicked === false) {
      return { status: 'uncertain', candidateId, text, externalActionUpdated: null,
        message: `标签点击未确认送达（hit=${tagClick?.hit ?? 'unknown'}）；不得自动重试，请人工核查平台结果` };
    }

    // 点击后即时只读取证（不重载，beforeunload 之前）：toast 文案、新增请求、记录增量
    let evidence = null;
    try {
      await randomDelay([600, 900]);
      evidence = await captureClickEvidence(page, { beforeRecords, beforeResources });
    } catch (error) {
      evidence = { captureError: error.message };
    }

    // 回读只读重试：写入落库与列表渲染有滞后（同 update-candidate 的 3.6.39.5 经验），
    // 重新加载详情页再读，不是写入重试。判定以记录条数增加为准（文本存英文翻译）。
    let verified = false;
    for (let round = 0; round < 3 && !verified; round++) {
      await randomDelay([800, 1200]);
      await hardGoto(page, detailUrl);
      await page.wait({ selector: '[data-test="detail-name:candidate"]', timeout: 30 });
      await randomDelay([1500, 2000]);
      const afterRecords = await countNoteRecords(page);
      verified = afterRecords > beforeRecords || await readNoteEcho(page, text);
      if (!verified) evidence = { ...evidence, lastRecordCount: afterRecords };
    }
    const evidenceText = evidence
      ? `（点击取证: toast=${evidence.toasts?.join('|') || '无'} 新请求=${evidence.newResources?.join('|') || '无'} 记录增量=${evidence.recordDelta ?? '?'} 基线=${beforeRecords}${evidence.captureError ? ` 抓取异常=${evidence.captureError}` : ''}）`
      : '';
    return verified
      ? { status: 'ok', candidateId, text, externalActionUpdated: true,
        message: '已点击快捷备注标签，重新加载详情页独立回读到新记录' }
      : { status: 'uncertain', candidateId, text, externalActionUpdated: null,
        message: `已点击一次标签但独立回读未确认新记录${evidenceText}；不得自动重试` };
  }
});
