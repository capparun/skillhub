/**
 * 候选人字段适配器：把 compare-candidate 的逻辑字段映射到详情页编辑弹窗的真实控件。
 *
 * 依据 2026-09-29 只读审计（docs/test-records/gllue-update-field-audit-20260929.md）
 * 在合成候选人 #67377 详情页实测：21 个 inline-edit 入口、控件分族、
 * 以及补充探针（手机主槽 input[name=mobile]、gender radio id 后缀、
 * 树选择弹窗触发器回显）。写入口全部走统一弹窗协议：
 *   入口 [data-test="inline-edit-btn:candidate$<pageField>"]（hover 显示）
 *   弹窗 [data-test="field-edit:candidate$<pageField>"]
 *   保存 [data-test="inline-edit-popover-save:candidate$<pageField>"]
 *   取消 [data-test="inline-edit-popover-cancel:candidate$<pageField>"]
 *
 * 分族：
 * - text     单文本 input；inputName 定位（email/mobile 只开放主槽，
 *            name 弹窗内 chineseName/englishName 两个 input）
 * - textarea 证书 textarea（HTMLTextAreaElement setter）
 * - radio    性别；radio name/id 前缀为动态数字（本轮实测 24_gender），
 *            选择器用 id 后缀 [id$="_gender-true|false"]，true=男 false=女
 * - tree     树选择；触发器在弹窗容器内，与 add-candidate 的
 *            fillTreeSelect 同构，直接复用；空值回显占位「请选择」需归一化为空串
 *
 * 并发守卫：每种控件写入前先读页面当前值，与预览绑定的 observedCurrent
 * （change.current）比较，不一致即拒绝写入（页面在预览后被他人/他处修改）。
 * 树选择因重复点击已选项会 toggle 反选，额外做"已是目标值即短路"，
 * 该短路不消耗一次性写入授权。
 */

import { randomDelay } from './utils.js';

export const FIELD_ADAPTERS = {
  // 单文本族（input name 与页面字段一致，见审计二.1）
  // sourceChannel = 候选人「渠道」属性；envelope 的 channel 是记录来源，不能撞名
  wechat: { pageField: 'gllueextwechat', family: 'text', inputName: 'gllueextwechat' },
  skype: { pageField: 'gllueextskype', family: 'text', inputName: 'gllueextskype' },
  sourceChannel: { pageField: 'gllueextChannel', family: 'text', inputName: 'gllueextChannel' },
  highestDegree: { pageField: 'gllueexthighestdegree', family: 'text', inputName: 'gllueexthighestdegree' },
  // 详情文本为「查看」遮蔽的联系方式：detail-field 回读永远读不到值，
  // update-candidate 必须弹窗级回读（读 input 值后取消，不点「查看」，不耗额度）
  email: { pageField: 'email', family: 'text', inputName: 'email', maskedContact: true },
  mobile: { pageField: 'mobile', family: 'text', inputName: 'mobile', maskedContact: true },
  name: { pageField: 'name', family: 'text', inputName: 'chineseName' },
  englishName: { pageField: 'name', family: 'text', inputName: 'englishName' },

  // textarea 族
  certificate: { pageField: 'gllueextcertification', family: 'textarea', inputName: null },

  // radio 族（动态数字前缀，禁止硬编码）
  gender: { pageField: 'gender', family: 'radio' },

  // 树选择族（fillTreeSelect 复用；nationality 弹窗字段名是 countries）
  nationality: { pageField: 'countries', family: 'tree' },
  industry: { pageField: 'industrys', family: 'tree' },
  function: { pageField: 'functions', family: 'tree' },
  owner: { pageField: 'owner', family: 'tree' },
  city: { pageField: 'citys', family: 'tree' }
};

export const OPEN_UPDATE_FIELDS = Object.keys(FIELD_ADAPTERS);

export function getFieldAdapter(field) {
  const adapter = FIELD_ADAPTERS[field];
  if (!adapter) {
    throw new Error(`字段 ${field || '(空)'} 尚未开放真实更新（本次开放: ${OPEN_UPDATE_FIELDS.join('/')}）`);
  }
  return adapter;
}

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function guardConcurrency(currentValue, observedCurrent) {
  if (normalize(currentValue) !== normalize(observedCurrent)) {
    throw new Error('页面当前值已在预览后变化，必须重新读取、比较并授权');
  }
}

export async function fillField(page, adapter, update, deps = {}) {
  switch (adapter.family) {
    case 'text':
      return fillTextLike(page, adapter, update, 'input');
    case 'textarea':
      return fillTextLike(page, adapter, update, 'textarea');
    case 'radio':
      return fillRadio(page, update);
    case 'tree':
      return fillTree(page, adapter, update, deps);
    default:
      throw new Error(`字段 ${update.field} 的控件族 ${adapter.family} 未实现`);
  }
}

async function fillTextLike(page, adapter, update, kind) {
  const containerSelector = `[data-test="field-edit:candidate$${adapter.pageField}"]`;
  const controlSelector = kind === 'textarea'
    ? `${containerSelector} textarea`
    : `${containerSelector} input[name="${adapter.inputName}"]`;
  try {
    await page.wait({ selector: controlSelector, timeout: 10 });
  } catch {
    throw new Error('编辑器输入框未出现；未点击保存，请核对页面能力或登录状态');
  }
  // 弹窗输入框出现 ≠ 值已回填：React 数据回填晚于元素挂载
  //（2026-09-29 验收实测：email 弹窗立即读会拿到空串，触发并发守卫误拒）。
  await randomDelay([400, 700]);
  const currentValue = await page.evaluate(selector => {
    const input = document.querySelector(selector);
    return input ? String(input.value || '').trim() : null;
  }, controlSelector);
  if (currentValue === null) throw new Error('无法读取页面当前值，未执行写入');
  guardConcurrency(currentValue, update.observedCurrent);
  if (normalize(currentValue) === normalize(update.value)) {
    return { filled: false, already: true };
  }
  const filled = await page.evaluate(({ selector, value }) => {
    const input = document.querySelector(selector);
    if (!input) return false;
    // 2026-09-29 真实验收实测：必须按元素类型取对应原型 setter，
    // 用 HTMLInputElement 的 value setter 调用 textarea 会抛 Illegal invocation
    const proto = input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === value;
  }, { selector: controlSelector, value: update.value });
  if (!filled) throw new Error('更新值未能写入编辑器，未点击保存');
  return { filled: true };
}

async function fillRadio(page, update) {
  const value = normalize(update.value);
  if (value !== '男' && value !== '女') {
    throw new Error(`性别更新值必须是「男」或「女」，收到: ${update.value}`);
  }
  const trueSelector = 'input[type="radio"][id$="_gender-true"]';
  const falseSelector = 'input[type="radio"][id$="_gender-false"]';
  try {
    await page.wait({ selector: trueSelector, timeout: 10 });
  } catch {
    throw new Error('编辑器输入框未出现；未点击保存，请核对页面能力或登录状态');
  }
  const currentValue = await page.evaluate(() => {
    if (document.querySelector('input[type="radio"][id$="_gender-true"]')?.checked) return '男';
    if (document.querySelector('input[type="radio"][id$="_gender-false"]')?.checked) return '女';
    return '';
  });
  guardConcurrency(currentValue, update.observedCurrent);
  if (normalize(currentValue) === value) return { filled: false, already: true };
  await page.click(value === '女' ? falseSelector : trueSelector);
  return { filled: true };
}

async function fillTree(page, adapter, update, deps) {
  const triggerSelector = `[data-test="field-edit:candidate$${adapter.pageField}"] .rlt-select-selector`;
  // 弹窗打开 ≠ 树选择值已回填：与文本族同样的 hydration 滞后
  //（2026-09-29 citys 验收实测：立即读触发器拿到空串，并发守卫误拒）。
  // 3.6.39.5 版本回填更慢（2026-10-04 industry 验收实测 400-700ms 仍拿到空串），
  // 改为只读重试：元素未挂载先等挂载，值仍为空则多读几轮再交给守卫裁决。
  try { await page.wait({ selector: triggerSelector, timeout: 10 }); } catch { /* 守卫会以空串裁决 */ }
  let rawCurrent = '';
  for (let round = 0; round < 4; round++) {
    await randomDelay([400, 700]);
    rawCurrent = await page.evaluate(selector =>
      document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '', triggerSelector);
    if (rawCurrent) break;
  }
  // 空值回显占位「请选择」（2026-09-29 citys 弹窗实测），归一化为空串再比较
  const currentValue = normalize(rawCurrent) === '请选择' ? '' : normalize(rawCurrent);
  const target = normalize(update.value);
  // 树选择重复点击已选项会 toggle 反选：已为目标值必须短路，且不消耗授权
  if (currentValue === target) return { filled: false, already: true };
  guardConcurrency(currentValue, update.observedCurrent);
  if (typeof deps.fillTreeSelect !== 'function') {
    throw new Error('树选择写入依赖缺失（fillTreeSelect）');
  }
  const result = await deps.fillTreeSelect(page, adapter.pageField, update.value);
  if (result !== 'ok') throw new Error(`树选择写入失败: ${result}`);
  return { filled: true };
}
