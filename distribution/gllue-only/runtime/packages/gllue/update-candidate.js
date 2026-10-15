import { cli, Strategy } from '@jackwener/opencli/registry';
import fs from 'node:fs';
import path from 'node:path';
import { GllueClient } from './lib/gllue-client.js';
import { hardGoto } from './lib/navigation.js';
import { buildUrl, getConfig } from './lib/auth.js';
import { randomDelay } from './lib/utils.js';
import { claimWriteApprovalOnce, readFreshApproval, stableHash } from './lib/write-approval.js';
import { getFieldAdapter, fillField } from './lib/candidate-field-adapters.js';
import { fillTreeSelect } from './add-candidate.js';

function readPreview(filePath) {
  if (!filePath) throw new Error('必须提供 --input 差异预览文件');
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`差异预览文件不存在: ${resolved}`);
  const preview = JSON.parse(fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, ''));
  const candidateId = String(preview.candidateId || '').trim();
  const hunterId = String(preview.hunterId || '').trim();
  let origin;
  try { origin = new URL(preview.origin); } catch { throw new Error('差异预览 origin 无效'); }
  if (preview.action !== 'update_candidate' || preview.approvalRequired !== true ||
      preview.readyForApproval !== true || !/^\d+$/.test(candidateId) ||
      hunterId !== `gllue:${origin.host}:${candidateId}` ||
      !preview.writeSet || typeof preview.writeSet !== 'object' || Array.isArray(preview.writeSet) ||
      !/^sha256:[a-f0-9]{64}$/.test(String(preview.contentHash || ''))) {
    throw new Error('差异预览不完整、身份不一致或尚未达到授权条件');
  }
  const { contentHash, ...hashPayload } = preview;
  const recomputed = stableHash(hashPayload);
  if (contentHash !== recomputed) throw new Error('差异预览内容哈希无效，可能已被修改');
  if (!Number.isFinite(Date.parse(preview.observedAt))) throw new Error('差异预览缺少有效观察时间');
  return { ...preview, candidateId, hunterId, origin: origin.origin };
}

function selectedUpdate(preview, field, confirmed) {
  const selected = String(field || '').trim();
  // 适配器查询必须在页面访问前完成：未开放字段直接拒绝
  const adapter = getFieldAdapter(selected);
  const fields = Object.keys(preview.writeSet);
  if (!Object.hasOwn(preview.writeSet, selected)) throw new Error(`差异预览不包含字段 ${selected}`);
  if (confirmed && fields.length !== 1) throw new Error('真实更新每次只允许一个字段，请生成单字段差异预览');
  const value = preview.writeSet[selected];
  if (typeof value !== 'string' || !value.trim()) throw new Error('更新值必须是非空字符串');
  const change = Array.isArray(preview.changes)
    ? preview.changes.find(item => item?.field === selected)
    : null;
  // 2026-09-29 决策：conflict（已有值允许覆盖）与 addition 均可授权写入，
  // 预览同时绑定旧值(current)与新值(proposed)，写入前与页面实时值再校验一次
  if (!change || !['addition', 'conflict'].includes(change.kind) ||
      String(change.proposed || '').trim() !== value.trim()) {
    throw new Error(`差异预览缺少字段 ${selected} 的完整变更证据`);
  }
  return {
    field: selected,
    pageField: adapter.pageField,
    adapter,
    value: value.trim(),
    observedCurrent: String(change.current || '').trim()
  };
}

function validateApproval(filePath, preview, update, now = Date.now()) {
  const approval = readFreshApproval(filePath, 'update_candidate',
    '真实更新必须提供 --approval 授权文件', now);
  const observedAt = Date.parse(preview.observedAt);
  if (observedAt > now + 30_000) throw new Error('候选人观察时间不能来自未来');
  if (now - observedAt > 15 * 60_000) throw new Error('候选人观察已过期，请重新读取并比较');
  if (String(approval.candidateId) !== preview.candidateId) throw new Error('授权候选人与当前预览不匹配');
  if (approval.field !== update.field) throw new Error('授权字段与当前更新不匹配');
  if (approval.contentHash !== preview.contentHash) throw new Error('授权内容哈希不匹配，请重新预览并确认');
  return approval;
}

cli({
  site: 'gllue',
  name: 'update-candidate',
  description: '按已审核的单字段差异预览更新候选人；默认 dry-run，真实更新需精确授权',
  access: 'write',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    { name: 'input', type: 'string', required: true, description: 'compare-candidate 生成的单候选人差异预览 JSON' },
    { name: 'field', type: 'string', required: true, description: '本次唯一更新字段；支持 wechat/skype/sourceChannel/highestDegree/email/mobile/name/englishName/certificate/gender/nationality/industry/function/owner/city' },
    { name: 'confirm', type: 'boolean', required: false, description: '为 true 才进入真实更新安全门；单独使用不足以授权' },
    { name: 'approval', type: 'string', required: false, description: '15 分钟内绑定候选人、字段和内容哈希的授权 JSON 文件' }
  ],
  columns: ['status', 'candidateId', 'field', 'message'],
  func: async (page, kwargs) => {
    const preview = readPreview(kwargs.input);
    const confirmed = kwargs.confirm === true || kwargs.confirm === 'true';
    const update = selectedUpdate(preview, kwargs.field, confirmed);
    if (!confirmed) {
      return {
        status: 'dry_run', candidateId: preview.candidateId, field: update.field, value: update.value,
        contentHash: preview.contentHash, externalActionUpdated: false,
        message: '未写入；真实更新需 --confirm 与字段级授权文件'
      };
    }
    const config = getConfig();
    if (preview.origin !== new URL(buildUrl(config)).origin) {
      throw new Error('差异预览目标租户不匹配当前 Gllue 配置，拒绝更新');
    }
    const approval = validateApproval(kwargs.approval, preview, update);

    const client = new GllueClient(page);
    await client.checkAuth();
    const detailUrl = buildUrl(config, `/crm/candidate/detail?id=${encodeURIComponent(preview.candidateId)}`);
    await hardGoto(page, detailUrl);
    // 等详情内容锚点渲染（3.6.39.5 首访慢至 8s+，仅固定延时会在编辑入口探测时扑空）
    await page.wait({ selector: '[data-test="detail-name:candidate"]', timeout: 30 });
    await randomDelay(config.delays.pageLoad);
    const observedUrl = await page.evaluate(() => window.location.href);
    if (observedUrl !== detailUrl) throw new Error('候选人详情页身份不匹配，拒绝更新');

    const prepared = await page.evaluate(pageField => {
      const container = document.querySelector(`[data-test="detail-field:candidate$${pageField}"]`);
      const button = document.querySelector(`[data-test="inline-edit-btn:candidate$${pageField}"]`);
      if (!container || !button) return false;
      container.scrollIntoView?.({ block: 'center' });
      for (const type of ['mouseenter', 'mouseover']) {
        container.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
      button.setAttribute('data-opencli-update-target', pageField);
      return true;
    }, update.pageField);
    if (!prepared) throw new Error(`页面未提供 ${update.field} 编辑入口，未执行写入`);
    await page.click(`[data-opencli-update-target="${update.pageField}"]`);
    const saveSelector = `[data-test="inline-edit-popover-save:candidate$${update.pageField}"]`;
    const fillResult = await fillField(page, update.adapter, update, { fillTreeSelect });
    if (fillResult.already) {
      // 页面已是目标值：无需写入，不消耗一次性授权，仅关闭弹窗
      try {
        await page.click(`[data-test="inline-edit-popover-cancel:candidate$${update.pageField}"]`);
      } catch { /* 关闭弹窗失败不影响结果，保存从未点击 */ }
      return { status: 'ok', candidateId: preview.candidateId, field: update.field,
        externalActionUpdated: false,
        message: `字段 ${update.field} 页面当前已是目标值「${update.value}」，未执行保存` };
    }

    // 保存是唯一外部写动作；不自动重试。
    // React 受控组件的 onChange 状态合并是异步的，留一拍再点保存
    //（2026-09-29 验收实测：个别弹窗如 email 立即点保存会校验失败、编辑器不关闭）。
    claimWriteApprovalOnce(config.output.baseDir, config.tenant, approval);
    await randomDelay([400, 700]);
    try {
      await page.click(saveSelector);
      // 编辑器关闭有动画/提交滞后（email 弹窗实测保存已落库但弹窗晚一拍才关），
      // 只读轮询等待关闭，不是写入重试。
      let settled = null;
      for (let round = 0; round < 4; round++) {
        await randomDelay([700, 1000]);
        settled = await page.evaluate(selector => ({
          url: location.href,
          editorOpen: !!document.querySelector(selector)
        }), saveSelector);
        if (settled && settled.url === detailUrl && !settled.editorOpen) break;
      }
      if (!settled || settled.url !== detailUrl || settled.editorOpen) {
        return { status: 'uncertain', candidateId: preview.candidateId, field: update.field,
          externalActionUpdated: null, message: '已点击一次保存但编辑器未明确结束；保持当前页面，不导航或重试' };
      }
      await hardGoto(page, detailUrl);
      // 回读校验按族区分：radio/tree 要求回显完全等于目标值；
      // text/textarea 用包含匹配（姓名弹窗的中英文双 input 在同一 detail-field 回显）。
      // email/mobile 详情文本是「查看」遮蔽（2026-09-29 验收实测），detail-field 回读
      // 永远不匹配，必须弹窗级回读：打开编辑器读 input 值后取消关闭，
      // 与观测同通道，不点「查看」，不消耗联系人解锁额度。
      const expected = update.value.replace(/\s+/g, ' ').trim();
      let verified = false;
      let readbackDebug = '';
      if (update.adapter.maskedContact) {
        await page.wait({ selector: '[data-test="detail-name:candidate"]', timeout: 10 });
        // 整页刷新后 React 交互组件挂载滞后于 DOM 渲染，重开编辑器前留一拍
        await randomDelay([800, 1200]);
        // 保存后编辑器可能仍开着（email 弹窗实测）：已开则直接读，不再找入口按钮
        const editorAlreadyOpen = await page.evaluate(pageField =>
          !!document.querySelector(`[data-test="field-edit:candidate$${pageField}"]`), update.pageField);
        if (!editorAlreadyOpen) {
          const reopen = await page.evaluate(pageField => {
            const container = document.querySelector(`[data-test="detail-field:candidate$${pageField}"]`);
            const button = document.querySelector(`[data-test="inline-edit-btn:candidate$${pageField}"]`);
            if (!container || !button) return false;
            container.scrollIntoView?.({ block: 'center' });
            for (const type of ['mouseenter', 'mouseover']) {
              container.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
            }
            button.setAttribute('data-opencli-update-target', pageField);
            return true;
          }, update.pageField);
          if (reopen) await page.click(`[data-opencli-update-target="${update.pageField}"]`);
        }
        {
          const controlSelector = `[data-test="field-edit:candidate$${update.pageField}"] input[name="${update.adapter.inputName}"]`;
          try {
            await page.wait({ selector: controlSelector, timeout: 10 });
            // 弹窗 input 值回填滞后于元素挂载（与 fillTextLike 同因），读前留一拍
            await randomDelay([400, 700]);
            const observed = await page.evaluate(({ selector, maskedReadback: _marker }) => ({
              url: location.href,
              value: document.querySelector(selector)?.value ?? null
            }), { selector: controlSelector, maskedReadback: true });
            try {
              await page.click(`[data-test="inline-edit-popover-cancel:candidate$${update.pageField}"]`);
            } catch { /* 取消失败不影响回读结论 */ }
            const actual = String(observed?.value ?? '').replace(/\s+/g, ' ').trim();
            verified = observed?.url === detailUrl && actual === expected;
            if (!verified) readbackDebug = `遮蔽回读: url=${observed?.url === detailUrl ? 'ok' : 'mismatch'} 读到=${actual || '(空)'}`;
          } catch (error) {
            verified = false;
            readbackDebug = `遮蔽回读异常: ${error.message}`;
          }
        }
      } else {
        // 保存后后端落库有秒级滞后（2026-09-29 citys 验收实测：首次回读仍是旧值，
        // 独立 get-candidate 确认新值已落库）。回读只读重试：重新加载详情页再读，
        // 不是写入重试，不违反「uncertain 不自动重试」。
        // 3.6.39.5 树字段值回填滞后于容器渲染（2026-10-04 industry/function 验收
        // 实测：detail-field 容器与 label 立即出现，值数秒后才 hydrate，首轮读到
        // 只剩 label 的空值）。每轮先只读轮询容器值非空，再比对目标值。
        for (let round = 0; round < 3 && !verified; round++) {
          if (round > 0) {
            await randomDelay([800, 1200]);
            await hardGoto(page, detailUrl);
          }
          await page.wait({ selector: `[data-test="detail-field:candidate$${update.pageField}"]`, timeout: 10 });
          let actual = '';
          for (let poll = 0; poll < 10; poll++) {
            const readback = await page.evaluate(({ pageField }) => {
              const container = document.querySelector(`[data-test="detail-field:candidate$${pageField}"]`);
              const raw = container?.textContent?.trim().replace(/\s+/g, ' ') || '';
              const label = container?.querySelector('label')?.textContent?.trim().replace(/\s+/g, ' ') || '';
              return { url: location.href, value: label && raw.startsWith(label)
                ? raw.slice(label.length).trim() : raw };
            }, { pageField: update.pageField });
            actual = (readback?.value || '').replace(/\s+/g, ' ').trim();
            verified = readback?.url === detailUrl && (
              update.adapter.family === 'radio' || update.adapter.family === 'tree'
                ? actual === expected
                : actual.includes(expected)
            );
            if (verified || actual) break;
            await randomDelay([400, 700]);
          }
          if (actual) readbackDebug = `回读值=${actual.slice(0, 60)}`;
        }
      }
      return verified
        ? { status: 'ok', candidateId: preview.candidateId, field: update.field,
          externalActionUpdated: true, message: '保存后重新打开详情页，独立回读到新值' }
        : { status: 'uncertain', candidateId: preview.candidateId, field: update.field,
          externalActionUpdated: null,
          message: `已点击一次保存但独立回读未确认新值${readbackDebug ? `（${readbackDebug}）` : ''}；不得自动重试` };
    } catch (error) {
      return { status: 'uncertain', candidateId: preview.candidateId, field: update.field,
        externalActionUpdated: null,
        message: `保存点击已尝试，后续结果不确定；不得自动重试：${error.message}` };
    }
  }
});
