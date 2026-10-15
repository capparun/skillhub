import {createLiepinPage} from './page-connection.js';
import {inspectRecords} from './records-dom.js';
import {inspect} from './dom.js';
import {createNativeActions} from './native-actions.js';
import {checkReadRuntime} from './current-detail.js';
import {readBoundLocation} from './bound-page.js';
import {allowedSearchUrls} from './search-url.js';

// Preserve existing resource entries and allow new passive response timing on
// long-lived tabs whose default 250-entry buffer is already full.
export function prepareResultObservation({expectedUrls}) {
  if (!expectedUrls.includes(location.href)) throw new Error('搜索页已变化');
  performance.setResourceTimingBufferSize(2000);
  return {url:location.href};
}

// Fixed capability adapter. No arbitrary evaluate, navigation, network replay,
// capture fallback or access to the underlying OpenCLI Page escapes this object.
// Caller must hold a persistent task/site reservation before opening the driver.
export function createSearchDriver(page,{expectedUrl,actions=createNativeActions(page,{expectedUrl})}) {
  const expectedUrls=allowedSearchUrls(expectedUrl);
  let sequence=0,stopped=false;
  const actionId=()=>`search-action-${++sequence}`;
  const guarded=async execute=>{
    if(stopped)throw new Error('搜索驱动已停止；先核对持久任务记录，不自动恢复');
    try{return await execute();}catch(error){stopped=true;throw error;}
  };
  return Object.freeze({
    evaluate:(fn,request={})=>guarded(async()=>{
      if(fn!==inspect && fn!==inspectRecords)throw new Error('搜索驱动只允许固定的只读观察器');
      const state=await page.evaluate(fn,{...request,expectedUrl,expectedUrls});
      if(!state || !expectedUrls.includes(state.url) || state.blocked)throw new Error('搜索页已变化，停止当前任务');
      if(fn===inspectRecords && (state.blank || !Array.isArray(state.schemes)))throw new Error('搜索方案页面尚未确认');
      if(state.login || state.risk)throw new Error('出现登录失效或风控提示，停止当前任务');
      return state;
    }),
    prepareResultObservation:()=>guarded(async()=>{
      const state=await page.evaluate(prepareResultObservation,{expectedUrls});
      if(!expectedUrls.includes(state?.url))throw new Error('搜索响应观察未绑定当前页面');
    }),
    click:selector=>guarded(()=>actions.click({actionId:actionId(),selector})),
    fillText:(selector,value)=>guarded(()=>actions.fill({actionId:actionId(),selector,value})),
    hover:selector=>guarded(()=>actions.hover({actionId:actionId(),selector})),
    scrollTo:selector=>guarded(()=>actions.scrollTo({actionId:actionId(),selector})),
    scroll:(direction,pixels)=>guarded(()=>actions.scroll({actionId:actionId(),direction,pixels})),
    pressKey:key=>guarded(()=>{
      if(key!=='Escape')throw new Error('搜索驱动仅允许 Escape 收起下拉框');
      return actions.escape({actionId:actionId()});
    }),
  });
}

// Factory used by the task-based search CLI. The version/hash check
// proves the pinned transport files, not acceptance of all search behaviors.
export async function openCurrentSearchDriver(pageId) {
  if(typeof pageId!=='string' || !/^[A-Fa-f0-9]{16,128}$/.test(pageId))throw new Error('需要已观察到的 targetId');
  checkReadRuntime();
  const page=await createLiepinPage();
  page.setActivePage(pageId);
  try {
    const expectedUrl=await readBoundLocation(page,pageId,'/search/getConditionItem',{requireConnection:true});
    return Object.freeze({...createSearchDriver(page,{expectedUrl}),close:()=>page.closeWindow()});
  } catch(error) {
    await page.closeWindow();
    throw error;
  }
}
