import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'fs';
import path from 'path';
import { GllueClient } from './lib/gllue-client.js';
import { getConfig, buildUrl } from './lib/auth.js';
import { randomDelay, saveJson } from './lib/utils.js';
import { claimWriteApprovalOnce, readFreshApproval, stableHash, stableValue } from './lib/write-approval.js';

function buildWritePreview(candidate) {
  const payload = stableValue({ action: 'add_candidate', candidate });
  const contentHash = stableHash(payload);
  return { ...payload, contentHash };
}

function validateApproval(filePath, preview, now = Date.now()) {
  const approval = readFreshApproval(filePath, 'add_candidate',
    '真实创建必须提供 --approval 授权文件', now);
  if (approval.candidateName !== preview.candidate.name) throw new Error('授权候选人与当前内容不匹配');
  if (approval.contentHash !== preview.contentHash) throw new Error('授权内容哈希不匹配，请重新预览并确认');
  if (approval.tenant !== preview.targetTenant) throw new Error('授权租户不匹配，请针对当前租户重新确认');
  if (approval.origin !== preview.targetOrigin) throw new Error('授权站点不匹配，请针对当前站点重新确认');
  return approval;
}

export function classifyCandidateSaveEvidence({ detailId, duplicateIds = [] }) {
  const ids = [...new Set(duplicateIds.filter(id => /^\d+$/.test(String(id))).map(String))];
  if (/^\d+$/.test(String(detailId || ''))) {
    return { status: 'uncertain', id: String(detailId), candidateIds: [String(detailId)],
      externalActionCreated: null, evidence: 'detail_url_unverified' };
  }
  if (ids.length === 1) {
    return { status: 'duplicate_detected', id: ids[0], candidateIds: ids,
      externalActionCreated: false, evidence: 'duplicate_card' };
  }
  if (ids.length > 1) {
    return { status: 'uncertain', id: null, candidateIds: ids,
      externalActionCreated: null, evidence: 'multiple_duplicate_cards' };
  }
  return { status: 'unknown', id: null, candidateIds: [], externalActionCreated: null,
    evidence: 'no_confirmed_id' };
}

export async function verifyCreatedCandidate(client, candidate, id) {
  try {
    const actual = await client.getCandidate(id);
    const same = (left, right) => String(left || '').trim() === String(right || '').trim();
    const mismatchedFields = [];
    if (!same(actual.id, id)) mismatchedFields.push('id');
    const expectedNames = candidate.englishName
      ? [candidate.name, `${candidate.englishName} ${candidate.name}`]
      : [candidate.name];
    if (!expectedNames.some(name => same(actual.name, name))) mismatchedFields.push('name');
    if (!same(actual.email, candidate.email)) mismatchedFields.push('email');
    if (!same(actual.phone, candidate.mobile)) mismatchedFields.push('mobile');
    if (!actual.experience?.some(row => same(row.company_name, candidate.company) && same(row.title, candidate.title))) {
      mismatchedFields.push('experience');
    }
    if (mismatchedFields.length) {
      return { status: 'uncertain', id, candidateIds: [id], externalActionCreated: null,
        evidence: 'readback_mismatch', mismatchedFields };
    }
    return { status: 'ok', id, candidateIds: [id], externalActionCreated: true,
      evidence: 'detail_readback', readbackFilePath: actual.filePath || null };
  } catch (error) {
    return { status: 'uncertain', id, candidateIds: [id], externalActionCreated: null,
      evidence: 'readback_failed', reason: error.message };
  }
}

export function candidateDetailIdFromUrl(value, expectedOrigin) {
  try {
    const url = new URL(value);
    const id = url.searchParams.get('id');
    return url.origin === expectedOrigin && url.pathname === '/crm/candidate/detail' && /^\d+$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
}

export async function readCandidateSaveUrl(page) {
  return await page.evaluate(() => window.location.href) || '';
}

export async function settleAfterCandidateSave(readOutcome) {
  try {
    return await readOutcome();
  } catch (error) {
    return { status: 'uncertain', id: null, externalActionCreated: null,
      message: `保存已触发但后续结果读取失败，不能判定是否创建，不自动重试：${error.message}` };
  }
}

export function assessCandidateForm(candidate, filled, formState) {
  const requiredFilled = ['name', 'mobile', 'email', 'gllueextChannel', 'company',
    'title', 'resume', 'industrys', 'functions', 'countries'];
  const incompleteFields = requiredFilled.filter(field => filled[field] !== 'ok');
  for (const [field, actual, expected] of [
    ['name', formState.chineseName, candidate.name],
    ['mobile', formState.mobile, candidate.mobile],
    ['email', formState.email, candidate.email],
    ['gllueextChannel', formState.channel, candidate.gllueextChannel],
    ['company', formState.company, candidate.company],
    ['title', formState.title, candidate.title],
    ['nationality', formState.nationality, candidate.nationality],
    ['industry', formState.industry, candidate.industry],
    ['function', formState.function, candidate.function]
  ]) {
    if (actual !== expected && !incompleteFields.includes(field)) incompleteFields.push(field);
  }
  if (!formState.resumeAttachments?.includes(`${candidate.name}-简历.html`)) {
    incompleteFields.push('resumeAttachment');
  }
  return {
    readyToSave: incompleteFields.length === 0 && !formState.duplicateVisible,
    incompleteFields,
    duplicateVisible: !!formState.duplicateVisible
  };
}

async function prepareCandidateSave(page) {
  return page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter(button =>
      button.textContent.trim() === '保存' && button.getClientRects().length > 0);
    if (buttons.length === 0) return { status: 'not-found' };
    if (buttons.length !== 1) return { status: 'ambiguous' };
    if (buttons[0].disabled) return { status: 'disabled' };
    buttons[0].setAttribute('data-opencli-candidate-save', 'true');
    return { status: 'ready' };
  });
}

async function clickPreparedCandidateSave(page) {
  const click = await page.click('[data-opencli-candidate-save="true"]');
  return { status: 'clicked', method: click?.click_method || 'unknown', hit: click?.hit || 'unknown' };
}

export async function clickCandidateSaveOnce(page) {
  const target = await prepareCandidateSave(page);
  if (target.status !== 'ready') return target;
  return clickPreparedCandidateSave(page);
}

export async function clickCandidateSaveWithApproval(page, config, approval) {
  const target = await prepareCandidateSave(page);
  if (target.status !== 'ready') return target;
  // 点击结果不明时也保留占用；一次授权只允许一次真实写入尝试。
  try {
    claimWriteApprovalOnce(config.output.baseDir, config.tenant, approval);
  } catch (error) {
    return { status: 'approval-blocked', reason: error.message };
  }
  return clickPreparedCandidateSave(page);
}

export async function fillTreeSelect(page, forAttr, value, { delay = randomDelay } = {}) {
  if (!value) return 'skip';

  // 国籍字段的 data-test 是 `candidate$countries`（不带 field-edit: 前缀），
  // 其他 tree-select 字段是 `field-edit:candidate$xxx`。
  // 统一在这里构造候选选择器列表。
  const candidateSelectors = forAttr === 'countries'
    ? [`[data-test="candidate\\$countries"]`, `[data-test="field-edit:candidate\\$countries"]`]
    : [`[data-test="field-edit:candidate\\$${forAttr}"]`];

  // 滚动到目标位置（支持 label[for] 和 data-test 两种方式）
  await page.evaluate(({ attr, sels }) => {
    let formEl = null;
    const label = document.querySelector(`label[for="${attr}"]`);
    if (label) {
      formEl = label.closest('.slds-form-element');
    }
    if (!formEl) {
      for (const sel of sels) {
        const dt = document.querySelector(sel);
        if (dt) { formEl = dt.closest('.slds-form-element') || dt.parentElement; break; }
      }
    }
    if (!formEl) return;
    const sel = formEl.querySelector('.rlt-select-selector');
    if (sel) sel.scrollIntoView?.({ block: 'center' });
  }, { attr: forAttr, sels: candidateSelectors });
  await delay([500, 800]);

  const trigger = await page.evaluate((sels) =>
    sels.map(sel => `${sel} .rlt-select-selector`).find(sel => document.querySelector(sel)) || null,
  candidateSelectors);
  if (!trigger) return 'no-element';

  // 幂等短路（2026-09-29）：触发器已显示目标值时直接返回成功，不再打开菜单点选项。
  // 实测树选择重复点击已选项会 toggle 反选；详情页更新流程（fillField 树族）
  // 依赖此短路防止把已选值误清掉。空值回显占位「请选择」归一化为空串。
  const currentText = await page.evaluate((selector) =>
    document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '', trigger);
  if ((currentText === '请选择' ? '' : currentText) === String(value).trim()) return 'ok';

  // 下拉面板有两种形态（2026-09-29 实测）：
  // - add 表单面板：带 data-testid="<attr>"，宿主有 rlt-select-open 类，内有搜索框
  // - 详情编辑弹窗面板：class 含 comtree-edit-dropdown（rlt-select-dropdown 容器），
  //   无 data-testid、无 rlt-select-open、无搜索框
  // 2026-10-04 add 表单复验新发现：多选树面板确定后不自动关闭（保持可见挂载），
  // 且 3.6.39.5 的 add 表单 functions 面板已无 data-testid——按"含树标题的第一个
  // 可见面板"兜底会错标到上一棵树的滞留面板，进而在错误面板里点同名选项
  //（实测 functions 填充在 industrys 面板点击 Internet，把已选行业 toggle 掉）。
  // 因此无 testid 匹配时按「与当前触发器距离最近」的可见面板归属（rc-select 下
  // 拉 portal 总是定位在自己的 selector 下方，字段间距离远大于动画位移）。
  // 统一找到可见面板后打标记属性，后续选择器全部走标记；React 重渲染会丢标记，
  // 因此每次匹配前重新标记。
  const markPanel = () => page.evaluate(({ attr, triggerSel }) => {
    document.querySelectorAll('[data-opencli-tree-panel]').forEach(el =>
      el.removeAttribute('data-opencli-tree-panel'));
    const visible = node => node.getClientRects().length > 0;
    const name = `data-test-field-edit-multiple-tree:${attr}`;
    const candidates = [...document.querySelectorAll('.rlt-select-dropdown, [class*="comtree-edit"]')]
      .filter(visible);
    const anchorRect = document.querySelector(triggerSel)?.getBoundingClientRect();
    const distance = d => {
      if (!anchorRect) return 0;
      const r = d.getBoundingClientRect();
      return Math.abs(r.top - anchorRect.bottom) + Math.abs(r.left - anchorRect.left);
    };
    const nearest = list => [...list].sort((a, b) => distance(a) - distance(b))[0];
    const panel = candidates.find(d => d.getAttribute('data-testid') === attr) ||
      candidates.find(d => d.getAttributeNames().includes(name)) ||
      nearest(candidates.filter(d => d.querySelector('.rlt-select-tree-title'))) ||
      nearest(candidates);
    if (!panel) return false;
    panel.setAttribute('data-opencli-tree-panel', attr);
    return true;
  }, { attr: forAttr, triggerSel: trigger });

  const isOpen = () => page.evaluate(({ selector, attr }) => {
    const classOpen = !!document.querySelector(selector)?.closest('.rlt-select')
      ?.classList.contains('rlt-select-open');
    if (classOpen) return true;
    // 只看本字段的面板标记：其他树的滞留面板（多选树确定后不自动关闭，
    // 2026-10-04 实测）不得算作本树已展开
    return [...document.querySelectorAll(`[data-opencli-tree-panel="${attr}"]`)]
      .some(d => d.getClientRects().length > 0);
  }, { selector: trigger, attr: forAttr });

  // 打开面板：先 CDP 点击；编辑弹窗 flavor 实测 CDP 点击不展开
  //（hit=target 但无 rlt-select-open、无下拉节点），回退合成 mousedown 序列。
  const ensureOpen = async () => {
    if (await isOpen()) return true;
    const triggerClick = await page.click(trigger);
    if (triggerClick?.clicked === false) return false;
    await delay([600, 900]);
    if (await isOpen()) return true;
    // 回退：合成 mousedown/mouseup/click（rc-select 对 selector 监听 mousedown）
    await page.evaluate((selector) => {
      const sel = document.querySelector(selector);
      if (!sel) return false;
      for (const type of ['mousedown', 'mouseup', 'click']) {
        sel.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
      return true;
    }, trigger);
    await delay([800, 1200]);
    return isOpen();
  };
  // set 语义（2026-09-29 验收决策）：更新流程要求最终选择恰好等于目标值。
  // 多选树（意向城市等）标题点击是 toggle：先清空现有选择（allow-clear 的
  // 清除按钮），再选目标值；单选树清除按钮同样可用且无副作用。
  // 必须在下拉展开前清除（2026-10-04 industrys 弹窗实测：展开态下清除图标被
  // rc-select 吞事件，CDP/合成点击均无效；收起态合成事件有效）。清除本身
  // 不落库（保存才提交），此处只改弹窗内组件状态。
  if (currentText && currentText !== '请选择') {
    const clearSelector = `${trigger.replace(/\.rlt-select-selector$/, '')} .rlt-select-clear`;
    const hasClear = await page.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (!node) return false;
      node.setAttribute('data-opencli-tree-clear', '');
      return true;
    }, clearSelector);
    if (hasClear) {
      const clearClick = await page.click('[data-opencli-tree-clear]');
      await page.evaluate(() =>
        document.querySelector('[data-opencli-tree-clear]')
          ?.removeAttribute('data-opencli-tree-clear'));
      if (clearClick?.clicked === false) return 'clear-not-clicked';
      await delay([500, 800]);
      // 勾选树 flavor（详情编辑弹窗，节点带 checkbox，2026-10-04 functions 实测）：
      // CDP 点击不触发 React 切换，需回退合成事件序列；以触发器文本是否清空验证。
      let afterClear = await page.evaluate((selector) =>
        document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '', trigger);
      if (afterClear && afterClear !== '请选择') {
        const reMarked = await page.evaluate((sel) => {
          const node = document.querySelector(sel);
          if (!node) return false;
          node.setAttribute('data-opencli-tree-clear', '');
          for (const type of ['mousedown', 'mouseup', 'click']) {
            node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          }
          return true;
        }, clearSelector);
        if (!reMarked) return 'clear-not-clicked';
        await delay([500, 800]);
        afterClear = await page.evaluate((selector) =>
          document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '', trigger);
        if (afterClear && afterClear !== '请选择') return `clear-failed (current: ${afterClear})`;
      }
    }
  }

  if (!await ensureOpen()) return 'trigger-not-clicked';
  await markPanel();

  const optionSelector = forAttr === 'countries'
    ? '.rlt-select-item-option[title]'
    : '[data-opencli-tree-panel] .rlt-select-tree-title';
  const waitForOptions = async () => {
    try { await page.wait({ selector: optionSelector, timeout: 4 }); } catch { /* 由下方可见选项检查给出结果 */ }
    await markPanel();
  };
  await waitForOptions();

  // 仅标记当前可见的唯一选项，实际点击交给 Browser Bridge 的 CDP 鼠标事件。
  // 合成 MouseEvent 曾返回 found=true，但 React 表单没有真正选中该值。
  const findMatch = () => page.evaluate(({ text, attr }) => {
    const target = text.trim().toLowerCase();
    const visible = node => node.getClientRects().length > 0 &&
      getComputedStyle(node).visibility !== 'hidden';
    const items = attr === 'countries' ? [...document.querySelectorAll('.rlt-select-item-option[title]')]
      .filter(node => visible(node) && (node.getAttribute('title') || '').trim().toLowerCase() === target) : [];
    const panelTitles = [...document.querySelectorAll(`[data-opencli-tree-panel="${attr}"] .rlt-select-tree-title`)];
    const fallbackTitles = panelTitles.length ? [] :
      [...document.querySelectorAll(`[data-testid="${attr}"] .rlt-select-tree-title`)];
    const titles = [...panelTitles, ...fallbackTitles]
      .filter(node => visible(node) && node.textContent.trim().toLowerCase() === target);
    const matches = items.length ? items : titles;
    if (matches.length === 1) {
      // 勾选树 flavor（详情编辑弹窗，2026-10-04 functions 树实测）：节点内带
      // rlt-select-tree-checkbox，标题点击不选中，必须由 checkbox 承接点击标记。
      if (!items.length) {
        const checkbox = matches[0].closest('.rlt-select-tree-treenode')
          ?.querySelector('.rlt-select-tree-checkbox');
        if (checkbox) {
          checkbox.setAttribute('data-opencli-select-option', attr);
          return { found: true, mode: 'rlt-select-tree-checkbox' };
        }
      }
      matches[0].setAttribute('data-opencli-select-option', attr);
      return { found: true, mode: items.length ? 'rlt-select-item-option' : 'rlt-select-tree-title' };
    }

    return {
      found: false,
      optionTitles: attr === 'countries' ? [...document.querySelectorAll('.rlt-select-item-option[title]')]
        .filter(visible).map(t => (t.getAttribute('title') || '').trim().slice(0, 40)) : [],
      treeTitles: (panelTitles.length ? panelTitles
        : [...document.querySelectorAll(`[data-testid="${attr}"] .rlt-select-tree-title`)])
        .filter(visible).map(t => t.textContent.trim().slice(0, 40))
    };
  }, { text: value, attr: forAttr });
  let matchResult = await findMatch();
  if (!matchResult.found) {
    // 层级树导航（2026-09-29 意向城市树实测：顶层只有大洲节点，目标值在子级）。
    // add 表单面板自带搜索框：输入目标值过滤后再次匹配可见选项；
    // 编辑弹窗面板（comtree-edit-dropdown）无搜索框，此步自动跳过。
    const searchSelector = `[data-opencli-tree-panel] input[type="search"], [data-testid="${forAttr}"] input[type="search"]`;
    const hasSearch = await page.evaluate((sel) => !!document.querySelector(sel), searchSelector);
    if (hasSearch) {
      await page.evaluate(({ sel, text }) => {
        const input = document.querySelector(sel);
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }, { sel: searchSelector, text: value });
      await delay([500, 800]);
      await waitForOptions();
      matchResult = await findMatch();
    }
  }
  if (!matchResult.found) {
    // 无搜索框的层级树（编辑弹窗 flavor）：逐层展开 switcher-close 节点找目标。
    // 每层只展开未展开过的第一个节点（打标记防重复），最多 10 层。
    for (let round = 0; round < 10 && !matchResult.found; round++) {
      const expanded = await page.evaluate((attr) => {
        const visible = node => node.getClientRects().length > 0;
        const panel = document.querySelector(`[data-opencli-tree-panel="${attr}"]`);
        if (!panel) return false;
        // 其他树的面板仍挂载在 DOM（隐藏），其 drill 标记会让点击选择器多匹配
        //（2026-10-04 add 表单幂等复验实测），打标前全局清掉
        document.querySelectorAll('[data-opencli-tree-drill]').forEach(el =>
          el.removeAttribute('data-opencli-tree-drill'));
        const closed = [...panel.querySelectorAll(
          '.rlt-select-tree-treenode-switcher-close, [class*="switcher-close"]')]
          .filter(node => visible(node) &&
            !node.querySelector('[data-opencli-tree-expanded]') &&
            !node.hasAttribute('data-opencli-tree-expanded'));
        if (!closed.length) return false;
        closed[0].setAttribute('data-opencli-tree-expanded', '');
        closed[0].setAttribute('data-opencli-tree-drill', attr);
        return true;
      }, forAttr);
      if (!expanded) break;
      const drillClick = await page.click(
        `[data-opencli-tree-panel="${forAttr}"] [data-opencli-tree-drill]`);
      if (drillClick?.clicked === false) break;
      await delay([900, 1300]);
      await waitForOptions();
      matchResult = await findMatch();
    }
  }
  if (!matchResult.found) {
    const all = [...(matchResult.optionTitles || []), ...(matchResult.treeTitles || [])];
    return `no-match (可用选项: ${all.join(', ')})`;
  }

  if (matchResult.mode === 'rlt-select-tree-checkbox') {
    // 勾选树 flavor：CDP 点击 checkbox 不触发 React 切换（2026-10-04 functions
    // 树实测 hit=target 但 class 与状态均不变），合成 mousedown/mouseup/click
    // 才能提交勾选；选择结果由确定按钮提交后以触发器回显验证。
    await page.evaluate((attr) => {
      const box = document.querySelector(`[data-opencli-select-option="${attr}"]`);
      if (!box) return;
      for (const type of ['mousedown', 'mouseup', 'click']) {
        box.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    }, forAttr);
    await delay([400, 700]);
  } else {
    const optionClick = await page.click(`[data-opencli-select-option="${forAttr}"]`);
    if (optionClick?.clicked === false) return 'option-not-clicked';
  }
  if (matchResult.mode === 'rlt-select-tree-title' || matchResult.mode === 'rlt-select-tree-checkbox') {
    const confirmSelector = `[data-opencli-tree-panel="${forAttr}"] button, [data-testid="${forAttr}"] button`;
    const hasConfirm = await page.evaluate((selector) =>
      [...document.querySelectorAll(selector)].some(node =>
        node.getClientRects().length > 0 && node.textContent.trim() === '确定'), confirmSelector);
    if (!hasConfirm) return 'confirm-not-found';
    const confirmClick = await page.click(confirmSelector);
    if (confirmClick?.clicked === false) return 'confirm-not-clicked';
  }
  let selected = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    await delay([350, 500]);
    selected = await page.evaluate((selector) =>
      document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '', trigger);
    if (selected === value) break;
  }
  if (selected !== value) return `not-selected (current: ${selected || 'empty'})`;
  // 收尾收起面板（2026-10-04 add 表单实测：多选树确定后下拉不自动关闭，
  // 滞留的可见面板会污染下一棵树的展开判定与归属，必须主动收起；
  // 收起只切换下拉开合，不改变已提交的选择）
  try {
    if (await isOpen()) {
      const triggerClick = await page.click(trigger);
      if (triggerClick?.clicked !== false) await delay([400, 700]);
      if (await isOpen()) {
        await page.evaluate((selector) => {
          const sel = document.querySelector(selector);
          if (!sel) return;
          for (const type of ['mousedown', 'mouseup', 'click']) {
            sel.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
          }
        }, trigger);
        await delay([400, 700]);
      }
    }
  } catch { /* 收起面板失败不影响已确认的选择结果 */ }
  return 'ok';
}

// 等待简历解析静默。2026-09-28 实测:粘贴后页面的异步解析会在
// 5–20 秒内(时长不稳定)把已选中的行业/职能/国籍重置为"请选择";
// 仅看附件列表或当前值稳定无法覆盖"重置尚未发生"的窗口(重置前
// 下拉本身就是稳定的"请选择")。因此静默条件 = 附件已渲染 + 连续
// 两次稳定 + 固定安静期,之后才可以填下拉(见 fillCandidateForm)。
async function waitForParseSettleImpl(page, data, { timeoutMs = 25000, intervalMs = 1200, quietMs = 20000 } = {}) {
  const expected = `${data.name}-简历.html`;
  const read = () => page.evaluate(() => ({
    attached: [...document.querySelectorAll('a.attachment-item')]
      .map(a => a.textContent.trim()).filter(Boolean),
    trees: ['industrys', 'functions', 'countries'].map(attr =>
      document.querySelector(`[data-test="field-edit:candidate\\$${attr}"] .rlt-select-selector`)
        ?.textContent?.replace(/\s+/g, ' ').trim() || '')
  })).catch(() => null);

  const deadline = Date.now() + timeoutMs;
  let prev = null;
  for (;;) {
    const state = await read();
    if (state && state.attached.includes(expected)) {
      const snapshot = JSON.stringify(state);
      if (snapshot === prev) break; // 连续两次一致
      prev = snapshot;
    } else {
      prev = null;
    }
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  // 固定安静期:覆盖重置延迟的观测上界(20s),期间不再有异步写。
  await new Promise(resolve => setTimeout(resolve, quietMs));
}

/**
 * 表单动态部分编排:先粘贴简历并等待解析静默,再填写 TreeSelect。
 * deps 可注入 { filled, fillTreeSelect, pasteResume, waitForParseSettle } 供测试。
 */
export async function fillCandidateForm(page, data, deps = {}) {
  const filled = deps.filled || {};
  const doPaste = deps.pasteResume || ((p, c, n) => pasteResume(p, c, n));
  const doFillTree = deps.fillTreeSelect || ((p, attr, v) => fillTreeSelect(p, attr, v));
  const doSettle = deps.waitForParseSettle || ((p, d) => waitForParseSettleImpl(p, d));

  if (data.resume) {
    try {
      filled.resume = await doPaste(page, data.resume, `${data.name}-简历`);
    } catch (e) {
      filled.resume = 'error: ' + e.message;
    }
    await doSettle(page, data);
  }

  const treeSelectFields = [
    { forAttr: 'industrys', dataKey: 'industry' },
    { forAttr: 'functions', dataKey: 'function' },
    { forAttr: 'owner', dataKey: 'owner' },
    { forAttr: 'countries', dataKey: 'nationality' },
    { forAttr: 'citys', dataKey: 'city' },
    { forAttr: 'locations', dataKey: 'location' }
  ];
  for (const { forAttr, dataKey } of treeSelectFields) {
    if (data[dataKey]) {
      let result = 'error';
      try {
        result = await doFillTree(page, forAttr, data[dataKey]);
      } catch (e) { result = 'error: ' + e.message; }
      filled[forAttr] = result;
    }
  }
  return filled;
}

async function pasteResume(page, content, fileName = '简历') {
  if (!content) return 'skip';

  // 1. 点击"粘贴文档"按钮
  const btnClicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent.trim() === '粘贴文档') { btn.click(); return true; }
    }
    return false;
  });
  if (!btnClicked) return 'no-paste-button';
  await randomDelay([3000, 4000]);

  // 2. 点击编辑器容器触发 CKEditor 加载
  await page.evaluate(() => {
    const modal = document.querySelector('.slds-modal.slds-fade-in-open');
    const editorContainer = modal?.querySelector('.slds-m-top--small');
    if (editorContainer) editorContainer.click();
  });
  await randomDelay([5000, 7000]);

  // 3. 检查 CKEditor 是否加载
  const ckeLoaded = await page.evaluate(() => typeof CKEDITOR !== 'undefined' && Object.keys(CKEDITOR.instances).length > 0);
  if (!ckeLoaded) return 'cke-not-loaded';

  // 4. 设置文件名
  await page.evaluate((name) => {
    const modal = document.querySelector('.slds-modal.slds-fade-in-open');
    const input = modal?.querySelector('input[type="text"]');
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, name);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, fileName);

  // 5. 设置 CKEditor 内容
  await page.evaluate((text) => {
    const editor = CKEDITOR.instances[Object.keys(CKEDITOR.instances)[0]];
    editor.setData(`<p>${text.replace(/\n/g, '</p><p>')}</p>`);
  }, content);

  // 6. 点击"确定"
  await page.evaluate(() => {
    const modal = document.querySelector('.slds-modal.slds-fade-in-open');
    const buttons = modal?.querySelectorAll('button');
    for (const btn of buttons || []) {
      if (btn.textContent.trim() === '确定') { btn.click(); break; }
    }
  });
  await randomDelay([2000, 3000]);

  return 'ok';
}

cli({
  site: 'gllue',
  name: 'add-candidate',
  description: '将候选人信息录入 Gllue（默认 dry-run；真实保存需 --confirm 与精确授权文件）',
  access: 'write',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    { name: 'file', type: 'string', required: false, description: '候选人 JSON 文件路径' },
    { name: 'name', type: 'string', required: false, description: '姓名（中文，覆盖 file）' },
    { name: 'englishName', type: 'string', required: false, description: '英文名（覆盖 file）' },
    { name: 'email', type: 'string', required: false, description: '邮箱（覆盖 file）' },
    { name: 'mobile', type: 'string', required: false, description: '手机号（覆盖 file）' },
    { name: 'wechat', type: 'string', required: false, description: '微信（覆盖 file）' },
    { name: 'skype', type: 'string', required: false, description: 'Skype（覆盖 file）' },
    { name: 'gender', type: 'string', required: false, description: '性别：男/女' },
    { name: 'nationality', type: 'string', required: false, description: '国籍（如 中国），必填，否则保存失败' },
    { name: 'highestDegree', type: 'string', required: false, description: '最高学历' },
    { name: 'channel', type: 'string', required: false, description: '渠道（必填，如 LinkedIn）' },
    { name: 'owner', type: 'string', required: false, description: '拥有者姓名（如 Angie）' },
    { name: 'industry', type: 'string', required: false, description: '行业' },
    { name: 'function', type: 'string', required: false, description: '职能' },
    { name: 'city', type: 'string', required: false, description: '常驻城市（如 上海，对应 citys 字段）' },
    { name: 'location', type: 'string', required: false, description: '地区（对应 locations 字段）' },
    { name: 'certificate', type: 'string', required: false, description: '证书' },
    { name: 'company', type: 'string', required: false, description: '当前公司（工作经历-公司，必填）' },
    { name: 'title', type: 'string', required: false, description: '当前职位（工作经历-职位，必填）' },
    { name: 'resume', type: 'string', required: false, description: '简历文本（通过粘贴文档功能录入）' },
    { name: 'confirm', type: 'boolean', required: false, description: '为 true 才进入真实创建安全门；单独使用不足以授权' },
    { name: 'approval', type: 'string', required: false, description: '15 分钟内、绑定候选人、内容哈希及租户站点的授权 JSON 文件' }
  ],
  columns: ['status', 'id', 'message'],
  func: async (page, kwargs) => {
    const config = getConfig();
    const client = new GllueClient(page);

    // ---- 1. 载入数据 ----
    let data = {};
    if (kwargs.file) {
      const filePath = path.resolve(kwargs.file);
      if (!fs.existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`);
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    const map = {
      name: 'name', englishName: 'englishName', email: 'email', mobile: 'mobile',
      wechat: 'gllueextwechat', skype: 'gllueextskype', gender: 'gender',
      nationality: 'nationality', highestDegree: 'gllueexthighestdegree',
      channel: 'gllueextChannel', owner: 'owner', industry: 'industry',
      function: 'function', city: 'city', location: 'location',
      certificate: 'gllueextcertification', company: 'company', title: 'title',
      resume: 'resume'
    };
    for (const [arg, key] of Object.entries(map)) {
      if (data[arg] !== undefined && data[key] === undefined) data[key] = data[arg];
    }
    for (const [arg, key] of Object.entries(map)) {
      if (kwargs[arg] !== undefined && kwargs[arg] !== '') data[key] = kwargs[arg];
    }

    if (!data.name) throw new Error('姓名 (name) 是必填字段，请通过 --file 或 --name 提供');

    const doConfirm = kwargs.confirm === true || kwargs.confirm === 'true';
    const writeData = Object.fromEntries([...new Set(Object.values(map))]
      .filter(key => data[key] !== undefined && data[key] !== '')
      .map(key => [key, data[key]]));
    const writePreview = { ...buildWritePreview(writeData),
      targetTenant: config.tenant, targetOrigin: new URL(buildUrl(config)).origin };
    let approval = null;
    if (doConfirm) approval = validateApproval(kwargs.approval, writePreview);

    // 所有真实写入授权检查必须发生在任何 Gllue 页面访问之前。
    await client.checkAuth();

    // ---- 2. 打开页面 ----
    const addUrl = buildUrl(config, '/crm/candidate/add');
    await page.goto(addUrl, { waitUntil: 'networkidle2' });
    await randomDelay(config.delays.pageLoad);
    await randomDelay([2000, 3000]);

    // ---- 3. 等待 name 输入挂载 ----
    let nameMounted = false;
    for (let i = 0; i < 20; i++) {
      nameMounted = await page.evaluate(() => {
        const c = document.querySelector('[data-test="field-edit:candidate\\$name"]');
        return !!(c && c.querySelector('input'));
      });
      if (nameMounted) break;
      await randomDelay([800, 1200]);
    }

    // ---- 4. 填写文本字段 ----
    const filled = await page.evaluate((candidate) => {
      const out = {};
      const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const textareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;

      const setReactInput = (el, value) => {
        if (!el) return false;
        el.focus();
        inputSetter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        inputSetter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return el.value === value;
      };
      const setReactTextarea = (el, value) => {
        if (!el) return false;
        el.focus();
        textareaSetter.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        textareaSetter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        return el.value === value;
      };

      const nameContainer = document.querySelector('[data-test="field-edit:candidate\\$name"]');
      if (nameContainer) {
        const cnInput = nameContainer.querySelector('input[name="chineseName"], input');
        if (cnInput && candidate.name) out.name = setReactInput(cnInput, candidate.name) ? 'ok' : 'fail';
        const enInput = nameContainer.querySelectorAll('input')[1];
        if (enInput && candidate.englishName) out.englishName = setReactInput(enInput, candidate.englishName) ? 'ok' : 'fail';
      }

      const textFields = {
        mobile: 'mobile', email: 'email', gllueextwechat: 'gllueextwechat',
        gllueextskype: 'gllueextskype',
        gllueexthighestdegree: 'gllueexthighestdegree', gllueextChannel: 'gllueextChannel'
      };
      for (const [field, sel] of Object.entries(textFields)) {
        if (candidate[field]) {
          const el = document.querySelector(`input[name="${sel}"]`);
          if (el) out[field] = setReactInput(el, candidate[field]) ? 'ok' : 'fail';
        }
      }

      if (candidate.gllueextcertification) {
        const ta = document.querySelector('textarea[name="gllueextcertification"]');
        if (ta) out.certificate = setReactTextarea(ta, candidate.gllueextcertification) ? 'ok' : 'fail';
      }

      // 工作经历（candidateexperience）—— 公司和职位是必填
      if (candidate.company) {
        const companyContainer = document.querySelector('[data-test="field-edit:candidateexperience\\$company_name"]');
        const companyInput = companyContainer?.querySelector('input[type="text"]');
        if (companyInput) out.company = setReactInput(companyInput, candidate.company) ? 'ok' : 'fail';
        else out.company = 'no-element';
      }
      if (candidate.title) {
        const titleContainer = document.querySelector('[data-test="field-edit:candidateexperience\\$title"]');
        const titleInput = titleContainer?.querySelector('input[name="title"], input[type="text"]');
        if (titleInput) out.title = setReactInput(titleInput, candidate.title) ? 'ok' : 'fail';
        else out.title = 'no-element';
      }
      // 勾选工作经历的"至今"checkbox，避免需要选年月
      if (candidate.company || candidate.title) {
        const timeContainer = document.querySelector('[data-test="field-edit:candidateexperience\\$time"]');
        const toNowCheckbox = timeContainer?.querySelector('input[type="checkbox"]');
        if (toNowCheckbox && !toNowCheckbox.checked) {
          toNowCheckbox.click();
          toNowCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          out.experienceToNow = 'ok';
        }
      }

      if (candidate.gender) {
        const isMale = candidate.gender === '男' || candidate.gender === 'male';
        // gender radio 的 id 是 `{formId}_gender-{true|false}` 形式，且以数字开头，
        // querySelector 用 # 选择器需要 CSS.escape，改用属性选择器更稳
        const sel = `input[type="radio"][id$="_gender-${isMale ? 'true' : 'false'}"]`;
        const radio = document.querySelector(sel);
        if (radio) {
          radio.click();
          radio.dispatchEvent(new Event('change', { bubbles: true }));
          out.gender = 'ok';
        } else {
          out.gender = 'not-found';
        }
      }

      return out;
    }, data);

    await randomDelay(config.delays.click);

    // ---- 5. 动态字段:先粘贴简历并等待解析静默,再填 TreeSelect ----
    // 顺序不可交换:解析落地前的下拉选择会被异步重置(见 waitForParseSettleImpl)。
    await fillCandidateForm(page, data, { filled });

    // ---- 6. 截图 + 导出填写状态 ----
    const outDir = config.output.baseDir;
    const debugDir = path.join(outDir, 'debug');
    fs.mkdirSync(debugDir, { recursive: true });
    const shotPath = path.join(debugDir, 'add-candidate-filled.png');
    try { await page.screenshot({ path: shotPath, fullPage: true }); } catch (e) {}

    const formState = await page.evaluate(() => ({
      chineseName: document.querySelector('input[name="chineseName"]')?.value || '(missing)',
      englishName: document.querySelector('input[name="englishName"]')?.value || '(missing)',
      mobile: document.querySelector('input[name="mobile"]')?.value || '(missing)',
      email: document.querySelector('input[name="email"]')?.value || '(missing)',
      wechat: document.querySelector('input[name="gllueextwechat"]')?.value || '(missing)',
      skype: document.querySelector('input[name="gllueextskype"]')?.value || '(missing)',
      channel: document.querySelector('input[name="gllueextChannel"]')?.value || '(missing)',
      nationality: document.querySelector('[data-test="candidate$countries"] .rlt-select-selector')?.textContent?.trim() || '(missing)',
      industry: document.querySelector('[data-test="field-edit:candidate$industrys"] .rlt-select-selector')?.textContent?.trim() || '(missing)',
      function: document.querySelector('[data-test="field-edit:candidate$functions"] .rlt-select-selector')?.textContent?.trim() || '(missing)',
      company: document.querySelector('[data-test="field-edit:candidateexperience$company_name"] input')?.value || '(missing)',
      title: document.querySelector('[data-test="field-edit:candidateexperience$title"] input')?.value || '(missing)',
      resumeAttachments: [...document.querySelectorAll('a.attachment-item')]
        .map(link => link.textContent.trim()).filter(Boolean),
      duplicateVisible: (document.body.innerText || '').includes('重复人才')
    }));

    const preflight = assessCandidateForm(data, filled, formState);
    const { readyToSave, incompleteFields } = preflight;

    const dump = { timestamp: new Date().toISOString(), input: data, filled, formState,
      writePreview, confirm: doConfirm, approval: approval ? {
        action: approval.action, approvedAt: approval.approvedAt, source: approval.source,
        candidateName: approval.candidateName, contentHash: approval.contentHash,
        tenant: approval.tenant, origin: approval.origin
      } : null };
    const dumpPath = saveJson(config, 'candidates', 'add-candidate-last.json', dump);

    if (!doConfirm) {
      return {
        status: 'dry-run',
        id: null,
        message: `${readyToSave ? '表单预检通过' : `表单预检未通过：${incompleteFields.join(', ') || '重复人才提示'}`}；未保存（dry-run）。截图: ${shotPath} | 状态: ${dumpPath}。真实创建需 --confirm 与精确授权文件。`,
        writePreview,
        filled,
        preflight
      };
    }

    if (!readyToSave) {
      return {
        status: 'blocked', id: null,
        message: `未点击保存：${incompleteFields.length ? `必填字段未核实 ${incompleteFields.join(', ')}` : '页面出现重复人才提示'}；请检查预演，不自动重试。`,
        filled,
        preflight
      };
    }

    // ---- 8. 真正保存 ----
    let saveAttempt;
    try {
      saveAttempt = await clickCandidateSaveWithApproval(page, config, approval);
    } catch (error) {
      return { status: 'uncertain', id: null, externalActionCreated: null,
        message: `保存点击结果不确定，不自动重试：${error.message}`, filled };
    }
    if (saveAttempt.status !== 'clicked') return { status: 'blocked', id: null,
      externalActionCreated: false,
      message: `未点击保存：${saveAttempt.reason || `保存按钮 ${saveAttempt.status}`}`, filled };

    return await settleAfterCandidateSave(async () => {
      await randomDelay(config.delays.pageLoad);
      await randomDelay([2000, 3000]);

      // 保存后截图，看是否还在表单页（验证错误）还是已跳走
      const afterShotPath = path.join(debugDir, 'add-candidate-after-save.png');
      try { await page.screenshot({ path: afterShotPath, fullPage: true }); } catch (e) {}

      // 抓取保存后的验证错误
      const saveErrors = await page.evaluate(() => {
        const errors = [];
        document.querySelectorAll('.slds-has-error, .slds-form-element__help').forEach(el => {
          const text = el.textContent.trim();
          if (text && !errors.includes(text)) errors.push(text);
        });
        const toasts = [];
        document.querySelectorAll('[class*="toast"], [role="alert"], [class*="notification"]').forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length < 200) toasts.push(text);
        });
        return { errors, toasts };
      });

      const currentUrl = await readCandidateSaveUrl(page);
      let detailId = null;
      let duplicateIds = [];

      // 1. URL 跳转（理想路径：保存成功后跳转到 /crm/candidate/detail?id=N）
      detailId = candidateDetailIdFromUrl(currentUrl, buildUrl(config));

      // 2. Gllue 重复检测卡片：保存成功后页面停留在 /add，但显示"重复人才"卡片，
      //    卡片标题里有 `#NNNNN`，链接到 /crm/candidate/detail?id=NNNNN
      if (!detailId) {
        const dupResult = await page.evaluate(() => {
          // 优先从链接提取 ID（最可靠）
          const links = document.querySelectorAll('a[href*="/crm/candidate/detail"]');
          const ids = new Set();
          for (const link of links) {
            const m = (link.getAttribute('href') || '').match(/[?&]id=(\d+)/);
            if (m) ids.add(m[1]);
          }
          if (ids.size) return { ids: Array.from(ids), source: 'duplicate-card-link' };

          // 回退：从卡片文本中提取 #NNNNN
          const bodyText = document.body.innerText || '';
          const hashMatches = bodyText.match(/#(\d{4,})/g) || [];
          const textIds = [...new Set(hashMatches.map(s => s.replace('#', '')))];
          if (textIds.length) return { ids: textIds, source: 'duplicate-card-text' };

          return { ids: [], source: null };
        });

        duplicateIds = dupResult.ids;
      }

      let saveEvidence = classifyCandidateSaveEvidence({ detailId, duplicateIds });
      if (detailId) saveEvidence = await verifyCreatedCandidate(client, data, detailId);
      const result = { ...dump, saved: saveAttempt, ...saveEvidence, url: currentUrl, saveErrors, afterShotPath };
      const filePath = saveJson(config, 'candidates', 'add-candidate.json', result);

      if (saveEvidence.status === 'ok') return { ...saveEvidence,
        message: `候选人已创建并独立回读核心字段, ID: ${saveEvidence.id}`, filePath };
      if (saveEvidence.status === 'duplicate_detected') return { ...saveEvidence,
        message: `平台显示重复人才 ID: ${saveEvidence.id}；未确认创建新记录，不自动重试`, filePath };
      if (saveEvidence.status === 'uncertain') return { ...saveEvidence,
        message: `${detailId ? `详情 ID ${detailId} 的独立回读未通过` : `平台显示多个候选人 ID: ${saveEvidence.candidateIds.join(', ')}`}；结果不确定，不自动重试保存`, filePath };
      const errSummary = saveErrors.errors.length ? ` 验证错误: ${saveErrors.errors.slice(0, 5).join(' | ')}` : '';
      return { ...saveEvidence, message: `已点击保存，但未能确认新 ID；不自动重试。${errSummary} 结果: ${filePath} 截图: ${afterShotPath}`, filePath };
    });
  }
});
