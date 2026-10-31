import {identifyListRow} from './list-identity.js';
import { plan, filters } from './filters.js';
import { inspect } from './dom.js';
import {waitForFreshResults} from './result-freshness.js';
export class SearchError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function isSearchPage(value) {
  try {const url=new URL(value);return url.origin==='https://h.liepin.com' && url.pathname==='/search/getConditionItem' && !url.username && !url.password;}
  catch {return false;}
}
export async function run(page, args, { pause = wait, submit = true, capture = false, requireFresh=true, onPage, onProgress, onFilterProgress } = {}) {
  let config;
  try { config = plan(args); } catch (error) { throw new SearchError('ARGUMENT', error.message); }
  // Reset can leave range editor drafts behind. Explicitly clear an omitted
  // salary boundary before submitting the pair, without changing public args.
  config.steps = config.steps.flatMap(step => {
    if (step.kind !== 'number') return [step];
    const oppositeKey = step.key.endsWith('Min')
      ? step.key.replace(/Min$/, 'Max') : step.key.replace(/Max$/, 'Min');
    if (config.steps.some(other => other.key === oppositeKey)) return [step];
    const [label, kind, selector] = filters[oppositeKey];
    return [{ key: oppositeKey, label, kind, selector, value: '', implicitClear: true }, step];
  });
  const read = async request => {
    let lastState;
    for (let attempt = 0; attempt < 12; attempt++) {
      const state = await page.evaluate(inspect, request);
      lastState=state;
      if (state.login) throw new SearchError('AUTH', '猎聘登录已失效');
      if (state.risk) {
        const evidence = state.riskSignals?.join('、') || '验证提示';
        throw new SearchError('RISK', `页面出现风险提示（${evidence}）；已停止，不重试`);
      }
      if (!isSearchPage(state.url)) {
        throw new SearchError('PAGE', `浏览器目标未保持在猎聘搜索页（当前 ${state.url || '未知地址'}）`);
      }
      if (!state.blank && (!state.loading || request.mode === 'results')) {
        // 定位成功后把容器路径回写到请求里,后续读校验钉住同一容器
        // (部分控件选中后行内不再显示字段名,按文本会丢失容器)。
        if (request.key && state.rootPath && !request.rootPath) request.rootPath = state.rootPath;
        return state;
      }
      if (attempt < 11) await pause(500);
    }
    if(lastState?.loading)throw new SearchError('LOADING','猎聘筛选自动查询仍在加载；停止后续动作，请核对已执行部分，不重复提交');
    throw new SearchError('BLANK', '猎聘页面持续空白；停止后续动作，请核对已执行部分');
  };
  await onProgress?.('preparing_filters');
  const current = await page.evaluate(inspect, {});
  if (!isSearchPage(current.url)) {
    throw new SearchError('PAGE', '请先打开已登录的猎聘搜索页；筛选引擎不会隐式导航或切换标签');
  }
  const controls = await read({ mode: 'controls' });
  if (submit && !controls.submit) {
    const actions = controls.visibleActions?.slice(0, 12).join('、') || '无';
    throw new SearchError('CONTROL', `未找到搜索控件（搜索候选 ${controls.submitCount ?? 0}；可见操作：${actions}）`);
  }
  if (controls.reset) {
    if(page.scrollTo){await page.scrollTo(controls.reset);await pause(250);}
    const resetState=await read({mode:'controls'});
    if(!resetState.reset)throw new SearchError('CONTROL','滚动后清空条件控件不再唯一，未点击');
    await page.click(resetState.reset);
    await pause(900);
  }
  const applied = [];
  // The site's reset leaves top-level title/company drafts and committed
  // summaries intact. Clear omitted fields explicitly so a new round cannot
  // silently inherit them from the previous search.
  for (const key of ['title','company']) {
    if (Object.hasOwn(args,key)) continue;
    const [label] = filters[key];
    const probe={key,label,kind:'text',value:''};
    let state=await read(probe);
    if (!state.rootPath || !state.value) continue;
    if(!state.target)throw new SearchError('CONTROL',`${label} 残留条件无法定位，停止搜索`);
    if(page.scrollTo)await page.scrollTo(state.target);
    state=await read(probe);
    await page.click(state.target);
    await page.fillText(state.target,'');
    await pause(300);
    state=await read(probe);
    if(state.value!=='' || !state.confirm)throw new SearchError('VERIFY',`${label} 残留条件尚未清空或缺少确认入口`);
    await page.click(state.confirm);
    await pause(700);
    state=await read(probe);
    if(state.value!=='')throw new SearchError('VERIFY',`${label} 清空后仍残留输入`);
    const summary=await read({mode:'selection-summary'});
    if(summary.selected?.some(item=>item.title===label))throw new SearchError('VERIFY',`${label} 清空后仍残留已选摘要`);
  }
  const pendingRanges = new Map();
  const locateExpansion = async (step, state) => {
    if (page.scrollTo) {
      await page.scrollTo(state.expand);
      await pause(250);
      state = await read(step);
    }
    if (!state.expand) throw new SearchError('CONTROL', '展开更多条件入口在滚动后失效');
    return state;
  };
  for (const step of config.steps) {
    await onFilterProgress?.({activeField:step.key,checked:applied.map(item=>({...item}))});
    let actionEvidence = null;
    let state = await read(step);
    // A keyword suggestion can cover the next field as well as a select.
    // Dismiss only an observed dropdown, then re-locate before native input.
    if ((state.dropdownCount ?? 0) > 0 && page.pressKey) {
      // Escape can replace suggestions with history while retaining focus.
      // Prefer a verified non-interactive field label to blur the old input.
      if (state.dropdownDismissTarget) await page.click(state.dropdownDismissTarget);
      else await page.pressKey('Escape');
      await pause(400);
      state = await read(step);
    }
    if (!state.target && !state.choice && state.expand) {
      state = await locateExpansion(step, state);
      if (page.hover) {
        await page.hover(state.expand);
        await pause(250);
        state = await read(step);
      }
      if (!state.expand) throw new SearchError('CONTROL', '展开更多条件入口在悬停后失效');
      await page.click(state.expand);
      await pause(900);
      state = await read(step);
    }
    if (step.kind === 'choice') {
      // 城市级联:行内只列热门城市,非热门城市走"其他"弹层——搜索联想取值后点确认,
      // 弹层关闭且行内出现 selected 标签,回落到常规选项校验。联想有防抖,等待给足。
      if (!state.choice && step.cascade === 'city' && state.cascadeTrigger) {
        actionEvidence = await page.click(state.cascadeTrigger);
        await pause(900);
        state = await read(step);
        if (!state.cityModal?.input) throw new SearchError('CONTROL', `${step.label} 的"其他"城市弹层未打开`);
        // 弹层搜索框只认城市关键词;"省份·城市"写法只填城市部分,省份用于候选匹配
        const fillValue = /[·・•]/.test(step.value)
          ? step.value.split(/[·・•]/).pop()
          : step.value;
        await page.click(state.cityModal.input);
        await pause(300);
        await page.fillText(state.cityModal.input, fillValue);
        await pause(1600);
        state = await read(step);
        if (!state.cityModal?.match) {
          const seen = state.cityModal?.suggestionTexts?.length ? `；可见候选：${state.cityModal.suggestionTexts.join('、')}` : '；无可见候选';
          throw new SearchError('CONTROL', `${step.label} 在城市弹层中无唯一候选；不猜测或提交；请求值「${step.value}」；匹配数 ${state.cityModal?.matchCount ?? 0}${seen}；可用「省份·城市」精确指定`);
        }
        actionEvidence = await page.click(state.cityModal.match);
        await pause(700);
        state = await read(step);
        if (!state.cityModal?.confirm || state.cityModal.confirmDisabled) throw new SearchError('CONTROL', `${step.label} 城市弹层的确认按钮不可用；未提交`);
        actionEvidence = await page.click(state.cityModal.confirm);
        await pause(900);
        state = await read(step);
      }
      if (!state.choice) throw new SearchError('CONTROL', `${step.label} 没有唯一选项 ${step.value}（匹配 ${state.choiceMatchCount ?? '未知'}；可见选项：${state.choiceOptions?.join('、') || '未找到'}）`);
      // 选项在 DOM 中但被折叠区域裁剪(中心点命中的是外层容器):先展开再操作,
      // 否则 CDP 点击只会落在容器上,label 永远收不到事件。
      const clipped = state.choiceEvidence?.hitRelation && !['self', 'descendant'].includes(state.choiceEvidence.hitRelation);
      if (clipped && state.expand) {
        state = await locateExpansion(step, state);
        if (page.hover) {
          await page.hover(state.expand);
          await pause(250);
        }
        await page.click(state.expand);
        await pause(900);
        state = await read(step);
        if (!state.choice) throw new SearchError('CONTROL', `${step.label} 的选项 ${step.value} 在展开后失效`);
      }
      if (!state.selected) {
        if (page.scrollTo) {
          await page.scrollTo(state.choice);
          await pause(250);
          state = await read(step);
          if (!state.choice) throw new SearchError('CONTROL', `${step.label} 的选项 ${step.value} 在滚动后失效`);
        }
        const covered = state.choiceEvidence?.hitRelation
          ? !['self', 'descendant'].includes(state.choiceEvidence.hitRelation)
          : state.choiceEvidence?.hitTag !== state.choiceEvidence?.tag;
        if (page.scroll && covered) {
          await page.scroll('down', 320);
          await pause(350);
          state = await read(step);
          if (!state.choice) throw new SearchError('CONTROL', `${step.label} 的选项 ${step.value} 在页面滚动后失效`);
        }
        if (page.hover) {
          await page.hover(state.choice);
          await pause(250);
          state = await read(step);
          if (!state.choice) throw new SearchError('CONTROL', `${step.label} 的选项 ${step.value} 在悬停后失效`);
        }
        actionEvidence = await page.click(state.choice);
        await pause(900);
      }
    } else if (step.kind === 'check') {
      if (!state.target) throw new SearchError('CONTROL', `未找到 ${step.label}`);
      // 开关位于折叠区域时点击会落在裁剪容器上,label 的激活行为收不到事件;先展开。
      const targetClipped = state.targetEvidence?.hitRelation && !['self', 'descendant'].includes(state.targetEvidence.hitRelation);
      if (targetClipped && state.expand) {
        state = await locateExpansion(step, state);
        if (page.hover) {
          await page.hover(state.expand);
          await pause(250);
        }
        await page.click(state.expand);
        await pause(900);
        state = await read(step);
        if (!state.target) throw new SearchError('CONTROL', `${step.label} 在展开后失效`);
      }
      if (state.checked !== (step.value === 'true')) {
        actionEvidence = await page.click(state.target);
        await pause(500);
      }
    } else {
      if (!state.target) throw new SearchError('CONTROL', `未找到 ${step.label}`);
      if (step.kind === 'select') {
        const selectClipped = ['ancestor','other'].includes(state.targetEvidence?.hitRelation);
        if (selectClipped && state.expand) {
          state = await locateExpansion(step, state);
          if (page.hover) {await page.hover(state.expand);await pause(250);}
          await page.click(state.expand);
          await pause(900);
          state = await read(step);
          if (!state.target) throw new SearchError('CONTROL', `${step.label} 在展开后失效`);
        }
        if (page.scrollTo) {
          await page.scrollTo(state.target);await pause(250);state=await read(step);
          if(!state.target)throw new SearchError('CONTROL',`${step.label} 在滚动后失效`);
        }
        actionEvidence = await page.click(state.target);
      }
      else if (!(step.kind==='text' && state.value===step.value)) {
        // 输入框位于折叠区域时(命中祖先/其他元素),点击与联想面板都会被裁剪吞掉;先展开。
        const fillClipped = step.key!=='keyword' && ['ancestor','other'].includes(state.targetEvidence?.hitRelation);
        if (fillClipped && state.expand) {
          state = await locateExpansion(step, state);
          if (page.hover) {
            await page.hover(state.expand);
            await pause(250);
          }
          await page.click(state.expand);
          await pause(900);
          state = await read(step);
          if (!state.target) throw new SearchError('CONTROL', `${step.label} 在展开后失效`);
        }
        if (step.kind === 'autocomplete' && state.activationTarget) {
          if(page.scrollTo)await page.scrollTo(state.activationTarget);
          await page.click(state.activationTarget);
          await pause(300);
          state=await read(step);
          if(!state.target || state.inputReadOnly)throw new SearchError('CONTROL',`${step.label} 激活后输入框仍不可编辑`);
        }
        if(page.scrollTo){
          await page.scrollTo(state.target);
          await pause(250);
          state=await read(step);
          if(!state.target)throw new SearchError('CONTROL',`${step.label} 在滚动后无法唯一定位`);
        }
        // 自定义联想组件(search-component 等)要先聚焦出候选面板,且查询有防抖,等待给足。
        actionEvidence = await page.click(state.target);
        await pause(300);
        // Reset may clear React filter state while leaving the input DOM value.
        // Re-enter an equal nonempty salary draft to trigger native input events.
        if (step.kind === 'number' && step.value !== '' && state.value === step.value) {
          await page.fillText(state.target, '');
          const cleared = await read(step);
          if (cleared.value !== '') throw new SearchError('VERIFY', `${step.label} 旧草稿未清空；停止，不确认范围`);
        }
        await page.fillText(state.target, step.value);
      }
      await pause(step.kind === 'autocomplete' ? 1600 : 900);
      state = await read(step);
      if (step.kind === 'select' || step.kind === 'autocomplete') {
        // A missing dropdown after a click is uncertain, not proof the click
        // did not execute. Stop below rather than clicking the control again.
        if (!state.option) {
          const seen = state.dropdownOptions?.length ? `；可见候选：${state.dropdownOptions.join('、')}` : `；可见下拉 ${state.dropdownCount ?? 0} 个且无候选`;
          throw new SearchError('CONTROL', `${step.label} 无唯一候选项；不猜测或提交；请求值「${step.value}」${seen}；匹配数 ${state.optionMatchCount ?? '?'}。先核对实际下拉，不重复点击。`);
        }
        actionEvidence = await page.click(state.option);
        // 职位联想的回显是类目名(thirdJobName 等),先记下供验证比对。
        if (state.optionMeta) {
          step.expectedPills = [state.optionMeta.jobTitle, state.optionMeta.thirdJobName, state.optionMeta.secondtJobName, state.optionMeta.secondJobName, state.optionMeta.firstJobName].filter(Boolean);
        }
        await pause(700);
      }
    }
    const okOf = v => step.kind === 'choice' ? v.selected : step.kind === 'check' ? v.checked === (step.value === 'true') : ['select', 'autocomplete'].includes(step.kind) ? v.committed : v.value === step.value;
    let verified = await read(step);
    let ok = okOf(verified);
    // Native choices can also update after the automatic query completes.
    // Observe once more without repeating the click; still stop if unconfirmed.
    if (!ok && ['choice', 'check', 'select', 'autocomplete'].includes(step.kind)) {
      await pause(1500);
      verified = await read(step);
      ok = okOf(verified);
    }
    if (!ok) {
      const scene = JSON.stringify({field:step.key,selected:verified.selected,checked:verified.checked,committed:verified.committed,valueMatches:verified.value===step.value,hitRelation:verified.choiceEvidence?.hitRelation??verified.targetEvidence?.hitRelation,dropdownCount:verified.dropdownCount});
      const action = actionEvidence ? `；交互结果 ${JSON.stringify(actionEvidence)}` : '';
      throw new SearchError('VERIFY', `${step.label} 未能确认生效，停止提交；验证状态 ${scene}${action}。先核对页面与原操作记录，不重复点击。`);
    }
    const rangePrefix=step.kind==='number'?step.key.replace(/(?:Min|Max)$/,''):null;
    const rangeSteps=rangePrefix?config.steps.filter(s=>s.kind==='number' && s.key.replace(/(?:Min|Max)$/,'')===rangePrefix):[];
    if(rangeSteps.length>1 && step!==rangeSteps.at(-1)) {
      pendingRanges.set(rangePrefix,[...(pendingRanges.get(rangePrefix)??[]),step]);
      continue;
    }
    if(step.kind==='number' && !verified.confirm)throw new SearchError('CONTROL',`${step.label} 范围已填写但未找到唯一确定入口；未确认提交，停止后续动作`);
    if (verified.confirm) {
      await page.click(verified.confirm);
      await pause(700);
      const committed = await read(step);
      if(!okOf(committed))throw new SearchError('VERIFY',`${step.label} 确认后未能保持请求值；停止后续动作，请核对页面，不重复确认`);
      if (step.kind === 'number') {
        const bounds=Object.fromEntries(rangeSteps.map(item=>[item.key.endsWith('Min')?'min':'max',item.value]));
        const min=bounds.min ? String(Number(bounds.min)) : '';
        const max=bounds.max ? String(Number(bounds.max)) : '';
        const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const pattern=min && max ? `^${escaped(min)}(?:万)?[-~至—–]${escaped(max)}万$`
          : min ? `^${escaped(min)}万以上$` : `^${escaped(max)}万以下$`;
        if (committed.rangeSummaries?.length !== 1 || !new RegExp(pattern).test(committed.rangeSummaries[0]))
          throw new SearchError('VERIFY',`${step.label} 已选摘要与请求范围不一致；停止搜索，不重复确认`);
      }
    }
    for(const previous of pendingRanges.get(rangePrefix)??[]) {
      const state=await read(previous);
      if(state.value!==previous.value)throw new SearchError('VERIFY',`${previous.label} 范围确认后另一边界发生变化；停止后续动作，不重复确认`);
      if (!previous.implicitClear) applied.push({field:previous.key,value:previous.value});
    }
    pendingRanges.delete(rangePrefix);
    applied.push({ field: step.key, value: step.value });
    await onFilterProgress?.({activeField:null,checked:applied.map(item=>({...item}))});
  }
  // A later field can change an earlier draft. Verify the complete final state,
  // not only the state immediately after each individual action.
  for (const step of config.steps.filter(step => !step.implicitClear)) {
    const state = await read(step);
    const ok = step.kind === 'choice' ? state.selected
      : step.kind === 'check' ? state.checked === (step.value === 'true')
      : ['select','autocomplete'].includes(step.kind) ? state.committed : state.value === step.value;
    if (!ok) throw new SearchError('VERIFY', `${step.label} 在后续条件设置后发生变化；停止提交`);
  }
  if (!submit) {
    await read({ mode: 'controls' }); // Recheck page availability without requiring a submit target.
    return { applied, total: null, pageCount: 0, rows: [] };
  }
  const final = await read({ mode: 'controls' });
  if (!final.submit) throw new SearchError('CONTROL', '搜索按钮消失');
  await pause(500);
  // 提交前挂被动网络捕获(只监听响应,不发额外请求),用于从搜索接口响应提取简历 ID。
  // Network 域与触发过遥测的 Runtime.enable 无关;不支持时静默降级,行内不含 ID。
  const capturing = capture && (await page.startNetworkCapture?.('api-h.liepin.com').catch(() => false) ?? false);
  if (requireFresh) await page.prepareResultObservation?.();
  const baseline=requireFresh?await read({mode:'results',limit:config.limit}):null;
  await onProgress?.('submitting');
  await page.click(final.submit); // Exactly one submission. Never retry.
  await onProgress?.('submission_acknowledged');
  const readSettled = async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await pause(1000);
      const result = await read({ mode: 'results', limit: config.limit });
      if (!result.loading && (result.count > 0 || result.empty)) return result;
    }
    throw new SearchError('TIMEOUT', '搜索结果未确认；不要自动重新提交');
  };
  // 从搜索接口响应提取简历 ID:resList 与页面卡片同序,用脱敏姓名做对齐校验,
  // 对不上的行宁可不带 ID 也不猜测归属。不提取 resEname 等未脱敏字段。
  const attachIds = async rows => {
    rows=rows.map(identifyListRow);
    if (!capturing || !rows.length) return rows;
    const captures = await page.readNetworkCapture?.().catch(() => []) ?? [];
    const entry = captures.find(c => typeof c?.url === 'string' && c.url.includes('search-resumes') && c.responseStatus === 200 && typeof c.responsePreview === 'string');
    if (!entry) return rows;
    let resList = [];
    try { resList = JSON.parse(entry.responsePreview)?.data?.resList ?? []; } catch { return rows; }
    return rows.map((row, index) => {
      const item = resList[index];
      // 对齐校验:接口脱敏姓名必须是卡片姓名的前缀(卡片可能带徽标后缀,已尽量剔除)
      const resName = item?.simpleResumeForm?.resName;
      if (!item || (resName && row.name && !row.name.startsWith(resName))) return row;
      const form = item.simpleResumeForm ?? {};
      const detailPath = typeof item.detailUrl === 'string' && item.detailUrl.startsWith('/') ? `https://h.liepin.com${item.detailUrl}` : item.detailUrl ?? null;
      return {
        ...row,
        resumeId: form.resIdEncode ?? null,
        resumeUserId: item.usercIdEncode ?? null,
        detailUrl: detailPath,
        // 列表接口返回的展示字段;不取 resEname(未脱敏真名)、cPhoto 等敏感/技术字段
        age: form.resBirthYearAge ?? null,
        gender: form.resSexName ?? null,
        company: form.resCompany ?? null,
        jobTitle: form.resTitle ?? null,
        workHistory: (form.workExpFormList ?? []).map(w => ({
          title: w.rwTitle ?? null, company: w.rwCompname ?? null,
          start: w.rwStart ?? null, end: w.rwEnd ?? null, period: w.rwPeriod ?? null,
        })),
        educationHistory: (form.eduExpForms ?? []).map(e => ({
          school: e.red_school ?? null, major: e.red_special ?? null,
          degree: e.red_degree_name ?? null, start: e.red_start ?? null, end: e.red_end ?? null,
        })),
        resumeUpdatedAt: form.updateTime ?? null,
        lastLoginAt: form.loginTime ?? null,
        online: item.online ?? null,
        hasAttachResume: item.attachResume ?? null,
        fullTimeEdu: form.eduTz === undefined || form.eduTz === null ? null : form.eduTz === '1',
      };
    });
  };
  let result = requireFresh
    ? await waitForFreshResults(()=>read({mode:'results',limit:config.limit}),baseline,{pause})
    : await readSettled();
  await onProgress?.('results_confirmed');
  const rows = [];
  let pagesRead = 0;
  let warning = null;
  let status = 'completed';
  let interruption = null;
  // 翻页:仅在用户显式指定 --pages 时进行;每页点击一次"下一页",页码或内容
  // 没有前进就停,保留已读数据并注明原因;不自动重试、不加速。
  while (true) {
    const pageNo = result.pagination?.current ?? pagesRead + 1;
    const currentRows=(await attachIds(result.rows)).map(row => ({ ...row, page: pageNo }));
    rows.push(...currentRows);
    pagesRead += 1;
    // Save confirmed pages before another browser action. A later disconnect or
    // process crash must not erase already observed candidates.
    if(onPage)await onPage({rows:structuredClone(rows),currentRows:structuredClone(currentRows),currentPage:pageNo,pages:pagesRead,total:result.total});
    if (pagesRead >= config.pages) break;
    if (!result.pagination?.next) {
      if(result.empty || (result.pagination?.totalPages>0 && result.pagination.current>=result.pagination.totalPages))break;
      warning = '没有可用的下一页控件，停止翻页';status='blocked';break;
    }
    const beforePage = result.pagination.current;
    const firstRow = result.rows[0] ? `${result.rows[0].name}|${result.rows[0].experience}` : null;
    try {
      await page.click(result.pagination.next);
      // Allow rendering to settle; this wait is not a claimed safe frequency.
      await pause(2000);
      const nextResult = requireFresh
        ? await waitForFreshResults(()=>read({mode:'results',limit:config.limit}),result,{pause})
        : await readSettled();
      const nextFirstRow = nextResult.rows[0] ? `${nextResult.rows[0].name}|${nextResult.rows[0].experience}` : null;
      const pageAdvanced = nextResult.pagination?.current && beforePage
        ? nextResult.pagination.current !== beforePage
        : firstRow !== null && nextFirstRow !== firstRow;
      if (!pageAdvanced) { warning = '翻页后页码与内容均未变化，停止翻页';status='unknown';break; }
      result = nextResult;
    } catch(error) {
      status=['AUTH','RISK','PAGE'].includes(error?.code)?'blocked':'unknown';
      interruption={code:String(error?.code ?? 'UNKNOWN'),message:String(error?.message ?? error)};
      warning='翻页中断，已保留此前确认的结果；不自动重试';break;
    }
  }
  return { applied, total: result.total, pageCount: result.count, pages: pagesRead, warning, rows, status, interruption };
}
