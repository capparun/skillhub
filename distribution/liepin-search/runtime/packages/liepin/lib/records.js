import { inspectRecords } from './records-dom.js';

export async function readSavedSearches(page) {
  return page.evaluate(inspectRecords, {});
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function saveSearchPlan(page, name, { pause = wait } = {}) {
  let state = await page.evaluate(inspectRecords, { name });
  if (state.schemes.some(item => item.name === name)) throw new Error(`搜索条件方案“${name}”已存在`);
  if (!state.saveButton) throw new Error('筛选已校验，但页面没有显示可用的“保存条件”按钮');
  await page.click(state.saveButton);
  await pause(700);
  state = await page.evaluate(inspectRecords, { name });
  return completeOpenSaveDialog(page,name,{pause,state});
}

// Recovery entry for an observed, unsubmitted save dialog. Does not reopen it.
export async function completeOpenSaveDialog(page,name,{pause=wait,state}={}) {
  if(typeof name!=='string' || !name.trim() || name.length>10)throw new Error('方案名须为1–10个字符');
  if(!state){
    state=await page.evaluate(inspectRecords,{name});
    if(!state.dialog?.text?.includes('保存新的搜索条件') || !['',name].includes(state.dialog.inputValue) || state.schemes.some(s=>s.name===name))throw new Error('当前弹窗不是可接续的未提交保存表单');
  }
  if (!state.dialog?.input || !state.dialog?.confirm) throw new Error('保存条件弹窗结构无法确认');
  if(state.dialog.subscription?.checked){
    await page.click(state.dialog.subscription.selector);
    await pause(250);
    state=await page.evaluate(inspectRecords,{name});
    if(!state.dialog?.input || !state.dialog?.confirm || state.dialog.subscription?.checked!==false)throw new Error('尚未确认关闭简历订阅，未保存');
  }
  const subscribed=state.dialog.subscription?.checked ?? null;
  await page.click(state.dialog.input);
  await page.fillText(state.dialog.input, name);
  await pause(250);
  await page.click(state.dialog.confirm);
  await pause(900);
  state = await page.evaluate(inspectRecords, { name });
  const exact = state.schemes.filter(item => item.name === name);
  if(state.saveSuccess){
    if(state.acknowledge){
      await page.click(state.acknowledge);
      // A success dialog can precede the asynchronously refreshed scheme list.
      // Observe only; never save or acknowledge a second time.
      for(let attempt=0;attempt<10;attempt++){
        await pause(250);
        state=await page.evaluate(inspectRecords,{name});
        if(state.schemes.filter(item=>item.name===name).length===1 && !state.saveSuccess)break;
      }
      if(state.saveSuccess)throw new Error('方案已收到保存成功提示，但成功弹窗关闭未确认；停止后续应用，不重复保存或点击');
    }
    return {name,subscribed,verification:'platform_success_dialog',listVerified:state.schemes.filter(item=>item.name===name).length===1};
  }
  if (exact.length !== 1) throw new Error('保存动作结果不明确；已停止且不会自动重试');
  return exact[0];
}

function uniqueScheme(state, name) {
  const matches = state.schemes.filter(item => item.name === name);
  if (matches.length !== 1) throw new Error(matches.length ? `搜索条件方案“${name}”不唯一` : `未找到搜索条件方案“${name}”`);
  return matches[0];
}

export async function applySavedSearch(page, name, { pause = wait } = {}) {
  const before = await page.evaluate(inspectRecords, { name });
  let scheme = uniqueScheme(before, name);
  if (!scheme.apply) throw new Error(`搜索条件方案“${name}”没有可用的应用入口`);
  if(page.scrollTo){
    await page.scrollTo(scheme.apply);await pause(250);
    scheme=uniqueScheme(await page.evaluate(inspectRecords,{name}),name);
    if(!scheme.apply)throw new Error('滚动后方案应用入口失效');
  }
  await page.click(scheme.apply);
  await pause(1800);
  return page.evaluate(inspectRecords, { name });
}

export async function deleteSavedSearch(page, name, { pause = wait } = {}) {
  let state = await page.evaluate(inspectRecords, { name });
  const scheme = uniqueScheme(state, name);
  if (!scheme.remove) throw new Error(`搜索条件方案“${name}”没有可用的删除入口`);
  await page.click(scheme.remove);
  await pause(500);
  state = await page.evaluate(inspectRecords, { name });
  if (!state.dialog?.confirm || !/确定删除该搜索条件/.test(state.dialog.text)) throw new Error('删除确认弹窗结构无法确认');
  await page.click(state.dialog.confirm);
  await pause(900);
  state = await page.evaluate(inspectRecords, { name });
  if (state.schemes.some(item => item.name === name)) throw new Error('删除结果不明确；已停止且不会自动重试');
  return { name, deleted: true };
}
