import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import fs from 'node:fs';
import path from 'node:path';
import { buildUrl, getConfig } from './lib/auth.js';
import { hardGoto } from './lib/navigation.js';
import { randomDelay } from './lib/utils.js';
import { claimWriteApprovalOnce, readFreshApproval, stableHash } from './lib/write-approval.js';

const BUTTON = '[data-test="detail-card-action:candidate$shortlist"]';
const MODAL = '.slds-modal';
const CLOSE = `${MODAL} .slds-modal__close`;
const OPTION = '.rlt-select-dropdown .rlt-select-item-option';

function readApprovedPreview(filePath, candidateId, jobId, origin, now = Date.now()) {
  if (!filePath) throw new ArgumentError('真实关联必须提供 --input 只读预览文件');
  const preview = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8').replace(/^\uFEFF/, ''));
  const payload = {
    action: preview.action, candidateId: preview.candidateId, jobId: preview.jobId,
    jobTitle: preview.jobTitle, origin: preview.origin,
    projectCount: preview.projectCount, observedAt: preview.observedAt
  };
  if (preview.status !== 'dry_run' || preview.externalActionUpdated !== false ||
      payload.action !== 'associate_job' || payload.candidateId !== candidateId ||
      payload.jobId !== jobId || payload.origin !== origin ||
      typeof payload.jobTitle !== 'string' || !payload.jobTitle.startsWith(`#${jobId} `) ||
      !Number.isInteger(payload.projectCount) || payload.projectCount < 0 ||
      !/^sha256:[a-f0-9]{64}$/.test(String(preview.contentHash || '')) ||
      stableHash(payload) !== preview.contentHash) {
    throw new ArgumentError('关联预览身份、状态或内容哈希无效');
  }
  const observedAt = Date.parse(payload.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > now + 30_000 || now - observedAt > 15 * 60_000) {
    throw new ArgumentError('关联预览已过期，请重新预览');
  }
  return preview;
}

function validateApproval(filePath, preview) {
  const approval = readFreshApproval(filePath, 'associate_job', '真实关联必须提供 --approval 授权文件');
  if (String(approval.candidateId) !== preview.candidateId ||
      String(approval.jobId) !== preview.jobId || approval.origin !== preview.origin ||
      approval.contentHash !== preview.contentHash) {
    throw new ArgumentError('关联授权的候选人、职位、租户或预览哈希不匹配');
  }
  return approval;
}

function numericId(value, label) {
  const id = String(value ?? '').trim();
  if (!/^\d+$/.test(id)) throw new ArgumentError(`${label} 必须是数字 ID`);
  return id;
}

cli({
  site: 'gllue',
  name: 'associate-job',
  description: '预览或按精确授权关联单个候选人与已有职位；默认只读',
  access: 'write',
  strategy: Strategy.Browser,
  domain: getConfig().domain,
  browser: true,
  args: [
    { name: 'candidateId', type: 'string', required: true, description: '候选人 ID' },
    { name: 'jobId', type: 'string', required: true, description: '目标职位 ID' },
    { name: 'jobKeyword', type: 'string', required: true, description: '项目选择框中可搜索的职位名称关键词' },
    { name: 'output', type: 'string', required: false, description: '预览时可选的新 JSON 审核文件路径；拒绝覆盖' },
    { name: 'confirm', type: 'boolean', required: false, description: '真实关联需为 true，单独使用不足以授权' },
    { name: 'input', type: 'string', required: false, description: '真实关联使用的只读预览 JSON' },
    { name: 'approval', type: 'string', required: false, description: '15 分钟内绑定候选人、职位、租户和预览哈希的人工授权 JSON' }
  ],
  columns: ['status', 'candidateId', 'jobId', 'jobTitle', 'projectCount', 'message'],
  func: async (page, kwargs) => {
    const candidateId = numericId(kwargs.candidateId, '候选人');
    const jobId = numericId(kwargs.jobId, '职位');
    const jobKeyword = String(kwargs.jobKeyword ?? '').trim();
    if (!jobKeyword) throw new ArgumentError('职位关键词不能为空');
    const confirmed = kwargs.confirm === true || kwargs.confirm === 'true';
    const outputPath = kwargs.output === undefined ? null : String(kwargs.output).trim();
    if (outputPath === '') throw new ArgumentError('输出文件路径不能为空');
    if (confirmed && outputPath) throw new ArgumentError('真实关联不接受 --output；请使用已有 --input 预览');
    if (outputPath && fs.existsSync(outputPath)) throw new ArgumentError(`输出文件已存在: ${outputPath}`);
    const url = buildUrl(getConfig(), `/crm/candidate/detail?id=${candidateId}`);
    const expected = new URL(url);
    const approvedPreview = confirmed
      ? readApprovedPreview(kwargs.input, candidateId, jobId, expected.origin)
      : null;
    if (approvedPreview) validateApproval(kwargs.approval, approvedPreview);
    await hardGoto(page, url);
    const landedUrl = await page.evaluate(() => location.href);
    const landed = new URL(landedUrl);
    if (landed.origin !== expected.origin || landed.pathname !== expected.pathname ||
        landed.searchParams.get('id') !== candidateId) {
      if (landed.origin === expected.origin && (landed.searchParams.has('next') || /login/i.test(landed.pathname))) {
        throw new AuthRequiredError(expected.host, 'Gllue 登录已失效，请先重新登录');
      }
      throw new CommandExecutionError('候选人详情页跳转到其他地址；未执行写入');
    }
    try {
      await page.wait({ selector: '[data-test="detail-name:candidate"]', timeout: 10 });
      // The name renders before the action bar; do not snapshot the SPA shell as a missing capability.
      await page.wait({ selector: BUTTON, timeout: 10 });
    } catch (error) {
      const currentUrl = await page.evaluate(() => location.href).catch(() => '');
      if (currentUrl) {
        const current = new URL(currentUrl);
        if (current.origin === expected.origin &&
            (current.searchParams.has('next') || /login/i.test(current.pathname))) {
          throw new AuthRequiredError(expected.host, 'Gllue 登录在候选人页面加载过程中失效；未执行写入');
        }
      }
      throw error;
    }
    const candidate = await page.evaluate(expectedId => {
      const current = new URL(location.href);
      const name = document.querySelector('[data-test="detail-name:candidate"]')?.textContent?.trim() || '';
      const text = document.querySelector('[data-test="detail-tab$项目"]')?.textContent || '';
      const match = text.match(/\d+/);
      return { url: current.href, id: current.searchParams.get('id'), name,
        projectCount: match ? Number(match[0]) : null, hasButton: !!document.querySelector('[data-test="detail-card-action:candidate$shortlist"]') };
    }, candidateId);
    const observed = new URL(candidate.url);
    if (observed.origin !== expected.origin || observed.pathname !== expected.pathname ||
        candidate.id !== candidateId || !candidate.name || !candidate.hasButton) {
      throw new CommandExecutionError('候选人页面身份或加入项目入口无法核实；未执行写入');
    }
    if (!Number.isInteger(candidate.projectCount) || candidate.projectCount < 0) {
      throw new CommandExecutionError('候选人项目数无法确认；未执行写入或生成预览');
    }
    if (approvedPreview && candidate.projectCount !== approvedPreview.projectCount) {
      throw new CommandExecutionError('候选人项目数在预览后变化，请重新预览与授权；未执行写入');
    }

    let submitted = false;
    try {
      await page.click(BUTTON);
      await page.wait({ selector: `${MODAL} .rlt-select-selector`, timeout: 10 });
      const modal = await page.evaluate(() => {
        const element = [...document.querySelectorAll('.slds-modal')].find(node => node.getClientRects().length);
        const button = [...(element?.querySelectorAll('button') || [])].find(node => node.textContent.trim() === '确定');
        return { open: !!element, confirmDisabled: button?.disabled ?? null };
      });
      if (!modal.open || modal.confirmDisabled !== true) {
        throw new CommandExecutionError('项目选择弹窗初始状态无法确认；未执行写入');
      }
      await page.click(`${MODAL} .rlt-select-selector`);
      const typed = await page.evaluate(value => {
        const input = document.querySelector('.slds-modal [role="combobox"]');
        if (!input) return false;
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!setter) return false;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return input.value === value;
      }, jobKeyword);
      if (!typed) throw new CommandExecutionError('项目搜索框未接收职位关键词；未执行写入');
      await page.wait({ selector: OPTION, timeout: 10 });
      const found = await page.evaluate(targetId => ({
        options: [...document.querySelectorAll('.rlt-select-dropdown .rlt-select-item-option')]
          .filter(node => node.getClientRects().length)
          .map(node => {
            const title = node.textContent.trim().replace(/\s+/g, ' ');
            return { id: title.match(/^#(\d+)\b/)?.[1] || null, title };
          }).filter(row => row.id === targetId)
      }), jobId);
      if (found.options.length !== 1) {
        throw new CommandExecutionError('目标职位未在当前可关联项目列表中唯一出现；未执行写入');
      }
      if (approvedPreview) {
        if (found.options[0].title !== approvedPreview.jobTitle) {
          throw new CommandExecutionError('目标职位标题在预览后变化，请重新预览与授权；未执行写入');
        }
        const marked = await page.evaluate(targetId => {
          const options = [...document.querySelectorAll('.rlt-select-dropdown .rlt-select-item-option')]
            .filter(node => node.getClientRects().length && node.textContent.trim().match(/^#(\d+)\b/)?.[1] === targetId);
          if (options.length !== 1) return false;
          options[0].setAttribute('data-opencli-associate-option', targetId);
          return true;
        }, jobId);
        if (!marked) throw new CommandExecutionError('目标职位选择器无法唯一锁定；未执行写入');
        await page.click(`[data-opencli-associate-option="${jobId}"]`);
        const ready = await page.evaluate(({ title, id }) => {
          const modal = [...document.querySelectorAll('.slds-modal')].find(node => node.getClientRects().length);
          const button = [...(modal?.querySelectorAll('button') || [])].find(node => node.textContent.trim() === '确定');
          const selected = modal?.querySelector('.rlt-select-selector')?.textContent?.replace(/\s+/g, ' ').trim() || '';
          if (!modal || !button || button.disabled || selected !== title) return false;
          button.setAttribute('data-opencli-associate-confirm', id);
          return true;
        }, { title: approvedPreview.jobTitle, id: jobId });
        if (!ready) throw new CommandExecutionError('目标项目暂选状态或确定按钮无法核实；未执行写入');
        const currentUrl = await page.evaluate(() => location.href);
        if (currentUrl !== url) throw new CommandExecutionError('提交前页面身份已变化；未执行写入');
        const freshPreview = readApprovedPreview(kwargs.input, candidateId, jobId, expected.origin);
        if (freshPreview.contentHash !== approvedPreview.contentHash) {
          throw new ArgumentError('关联预览在页面操作期间发生变化；未执行写入');
        }
        const approval = validateApproval(kwargs.approval, freshPreview);
        // This is the sole external write action. Once attempted, never retry automatically.
        const config = getConfig();
        claimWriteApprovalOnce(config.output.baseDir, config.tenant, approval);
        submitted = true;
        try {
          await page.click(`[data-opencli-associate-confirm="${jobId}"]`);
        } catch {
          return { status: 'uncertain', candidateId, jobId, jobTitle: approvedPreview.jobTitle,
            projectCount: candidate.projectCount, projectCountScope: 'before_submit',
            observedProjectCount: null, verification: 'confirm_click_failed', externalActionUpdated: null,
            message: '已尝试点击一次确定，结果不明；不得自动重试，请独立回读' };
        }
        let settled = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          await randomDelay([800, 1200]);
          const state = await page.evaluate(() => ({
            url: location.href,
            modalOpen: [...document.querySelectorAll('.slds-modal')]
              .some(node => node.getClientRects().length > 0)
          })).catch(() => null);
          if (!state || state.url !== url) break;
          if (!state.modalOpen) { settled = true; break; }
        }
        if (!settled) {
          return { status: 'uncertain', candidateId, jobId, jobTitle: approvedPreview.jobTitle,
            projectCount: candidate.projectCount, projectCountScope: 'before_submit',
            observedProjectCount: null, verification: 'modal_not_closed', externalActionUpdated: null,
            message: '已点击一次确定但弹窗未明确结束；保持当前页面，不导航或重试，请稍后独立回读' };
        }
        let readback = null;
        let readbackPhase = 'navigate';
        let readbackFailure = null;
        try {
          await randomDelay([500, 800]);
          await hardGoto(page, url);
          readbackPhase = 'candidate_wait';
          await page.wait({ selector: '[data-test="detail-name:candidate"]', timeout: 10 });
          // The name may render before the project tab during SPA hydration.
          readbackPhase = 'project_tab_wait';
          await page.wait({ selector: '[data-test="detail-tab$项目"]', timeout: 10 });
          readbackPhase = 'project_tab_click';
          await page.click('[data-test="detail-tab$项目"]');
          readbackPhase = 'project_link_wait';
          await page.wait({ selector: '.jobsubmission-card-header a[href*="/crm/joborder/detail"]', timeout: 10 });
          readbackPhase = 'snapshot';
          readback = await page.evaluate(targetId => {
            const current = new URL(location.href);
            const countText = document.querySelector('[data-test="detail-tab$项目"]')?.textContent || '';
            const count = countText.match(/\d+/);
            const links = [...document.querySelectorAll('.jobsubmission-card-header a[href*="/crm/joborder/detail"]')];
            return { url: current.href, count: count ? Number(count[0]) : null,
              matched: links.some(link => {
                try { return new URL(link.href).searchParams.get('id') === targetId; } catch { return false; }
              }) };
          }, jobId);
        } catch {
          // A failed readback cannot prove the write failed. Never submit again here.
          readbackFailure = `${readbackPhase}_failed`;
        }
        const verified = readback?.url === url && readback.matched === true &&
          readback.count === candidate.projectCount + 1;
        const verification = verified ? 'verified' : readbackFailure ||
          (!readback ? 'snapshot_missing' : readback.url !== url ? 'candidate_url_mismatch' :
            readback?.matched !== true ? 'target_link_missing' : 'project_count_mismatch');
        return { status: verified ? 'ok' : 'uncertain', candidateId, jobId,
          jobTitle: approvedPreview.jobTitle, projectCount: verified ? readback.count : candidate.projectCount,
          projectCountScope: verified ? 'after_submit' : 'before_submit',
          observedProjectCount: Number.isInteger(readback?.count) ? readback.count : null,
          verification,
          externalActionUpdated: verified ? true : null,
          message: verified ? '提交后页面独立回读到目标项目' : '已点击一次确定但未完成独立回读；projectCount 为提交前数量，不得自动重试' };
      }
      const observedAt = new Date().toISOString();
      const preview = { action: 'associate_job', candidateId, jobId,
        jobTitle: found.options[0].title, origin: expected.origin,
        projectCount: candidate.projectCount, observedAt };
      const result = { ...preview, contentHash: stableHash(preview), status: 'dry_run',
        externalActionUpdated: false, message: '只读预览；未选择或提交项目' };
      if (outputPath) {
        fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), {
          encoding: 'utf8', flag: 'wx', mode: 0o600
        });
      }
      return outputPath ? { ...result, outputPath } : result;
    } catch (error) {
      if (submitted) {
        return { status: 'uncertain', candidateId, jobId, jobTitle: approvedPreview.jobTitle,
          projectCount: candidate.projectCount, projectCountScope: 'before_submit',
          observedProjectCount: null, verification: 'post_submit_exception', externalActionUpdated: null,
          message: '已尝试点击一次确定，后续页面异常；不得自动重试，请独立回读' };
      }
      const currentUrl = await page.evaluate(() => location.href).catch(() => '');
      if (currentUrl) {
        const current = new URL(currentUrl);
        if (current.origin === expected.origin &&
            (current.searchParams.has('next') || /login/i.test(current.pathname))) {
          throw new AuthRequiredError(expected.host, 'Gllue 登录在项目选择过程中失效；未执行写入');
        }
      }
      throw error;
    } finally {
      if (!submitted) await page.click(CLOSE).catch(() => {});
    }
  }
});
