import {reviewListTarget} from './visible-reading.mjs';
import {inspectSavedCard,inspectDetailClickTarget,openListDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/open-list-detail.js';
import {readExpandedDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/expanded-detail.js';
import {createDetailBatch,runDetailBatch} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail-batch.js';
import {executeMcpOperation} from './execution.mjs';
import {createPageFacade,assertLiepinUrl} from './transport.mjs';
import {withStep,isStepTimeout,describeTrace} from './step-budget.mjs';
const validatePage=page=>typeof page==='string'&&/^\d+$/.test(page)&&Number.isSafeInteger(Number(page));
const DETAIL_PATH='/resume/showresumedetail/';
const DETAIL_ID=/^[A-Za-z0-9_-]{1,512}$/;
/** Production timings. Tests pass shorter ones so the same code path stays testable. */
export const DEFAULT_DETAIL_TIMINGS={clickReplyMs:12_000,discoveryMs:30_000,listTabsMs:8_000,pollMs:600};
/**
 * The only detail identity accepted from an address: https + exact path + exactly one res_id_encode.
 * Extra query parameters are allowed; anything else is not a detail page of this click.
 */
export function detailIdentityFromUrl(value){
 try{
  const url=new URL(value);
  if(url.origin!=='https://h.liepin.com'||url.pathname!==DETAIL_PATH||url.username||url.password)return null;
  const ids=url.searchParams.getAll('res_id_encode');
  if(ids.length!==1||!DETAIL_ID.test(ids[0]))return null;
  return {url:url.href,resumeId:ids[0]};
 }catch{return null;}
}
/**
 * Address-first discovery: look for a detail tab that did not exist before the click.
 * Independent of the click reply, which is the step that can stay silent.
 */
export async function discoverDetailTabByAddress({listTabs,before,deadline,timings=DEFAULT_DETAIL_TIMINGS,now=()=>Date.now(),pause=ms=>new Promise(r=>setTimeout(r,ms)),check=()=>{},trace,onStep=()=>{}}){
 let lastSeen=[];
 while(now()<deadline){
  check();
  let rows;
  try{
   rows=await withStep('list-tabs',listTabs,{timeoutMs:Math.min(timings.listTabsMs,Math.max(1,deadline-now())),trace,onTimeout:()=>onStep('查询浏览器标签清单超时，继续等待详情页出现')});
  }catch(error){
   if(!isStepTimeout(error))throw error;
   await pause(timings.pollMs);continue;
  }
  const fresh=(Array.isArray(rows)?rows:[])
   .map(row=>{const identity=detailIdentityFromUrl(row?.url);return identity?{tabId:String(row.tabId??row.id),...identity}:null;})
   .filter(row=>row&&validatePage(row.tabId)&&!before.has(row.tabId));
  lastSeen=fresh.map(row=>row.tabId);
  if(fresh.length>1)return {ambiguous:fresh,lastSeen};
  if(fresh.length===1)return {found:fresh[0],lastSeen};
  await pause(timings.pollMs);
 }
 return {found:null,lastSeen};
}
/** Follow only children returned by the single observed click, never arbitrary tabs. */
export async function openMcpDetailDriver(client,id,{signal,onAction=()=>{},readExpanded,visibleReading=false,timings=DEFAULT_DETAIL_TIMINGS}={}){
 const check=()=>{if(signal?.aborted)throw Error('操作已取消，已派发效果须核对');};
 check();await client.verify();check();
 const parent=client.tab(id),expectedUrl=await parent.url();assertLiepinUrl(expectedUrl,'/search/getConditionItem');
 const page=createPageFacade(parent,{signal,onAction});let origin,children=[],dispatched=false,method='observed-card-mcp-child';
 const trace=[];
 const log=(description,phase)=>onAction({at:new Date().toISOString(),description,phase});
 const closeChildren=async()=>{
  for(const child of [...children]){
   log('关闭本次打开的详情标签','dispatching');
   try{await child.handle.close();}catch(error){log(`详情标签未能关闭，保留在浏览器中：${error.message}`,'observed');throw error;}
   children=children.filter(entry=>entry!==child);log('详情标签关闭指令已返回；未单独回读标签列表','returned');
  }
 };
 const listExisting=async()=>{
  if(typeof client.userTabs!=='function')throw Error('当前运行时缺少标签清单接口；无法按地址确认详情页');
  return client.userTabs();
 };
 return {
  get method(){return method;},
  trace:()=>[...trace],
  check:async row=>{const state=await page.evaluate(inspectSavedCard,{...row,includeOrigin:true});origin=state.openerTimeOrigin;return state.matched&&Number.isFinite(origin);},
  click:async row=>{
   if(dispatched)throw Error('详情入口已经派发，不重复点击');
   if(visibleReading)await reviewListTarget(parent,row.cardSelector,{signal,onAction});
   const selector=await page.evaluate(inspectDetailClickTarget,{detailTarget:row.detailTarget});if(!selector)throw Error('未确认姓名文字入口');
   const state=await page.evaluate(inspectSavedCard,{...row,includeOrigin:true});
   if(!state.matched||state.openerTimeOrigin!==origin)throw Error('搜索文档或列表卡片已变化');
   // Snapshot before the click: a detail tab only counts as "new" relative to this set.
   // Missing list capability degrades to the click reply; it must not block the fast path.
   let before=new Set(),addressDiscovery=true,listError=null;
   try{before=new Set((await withStep('list-tabs-before',listExisting,{timeoutMs:timings.listTabsMs,trace})).map(row=>String(row?.tabId??row?.id)));}
   catch(error){
    addressDiscovery=false;listError=error.message;log(`点击前标签清单不可用（${error.message}）；本次只按点击回执确认详情`,'observed');
   }
   check();log('点击已核对卡片的姓名文字','dispatching');dispatched=true;
   let reply=null;
   try{
    reply=await withStep('click-reply',()=>parent.act({action:'click',target:{selector}}),{
     timeoutMs:timings.clickReplyMs,trace,
     onTimeout:ms=>log(`点击已派发，浏览器回执超过 ${Math.round(ms/1000)} 秒未返回；改为按详情页地址查找`,'observed'),
    });
   }catch(error){if(!isStepTimeout(error))throw error;}
   const ids=(reply?.openedTabs??[]).map(tab=>String(tab?.tab??tab?.tabId));
   if(ids.length===1&&validatePage(ids[0])&&ids[0]!==id){
    children=[{id:ids[0],handle:client.claimOpenedTab(ids[0]),owned:true}];method='observed-card-mcp-child';
    check(); // a cancellation observed after the click must still surface; the child stays captured for cleanup
    log(`点击回执确认新详情标签 ${ids[0]}（${describeTrace(trace)}）`,'returned');return;
   }
   if(ids.length>1)log(`点击回执报告了 ${ids.length} 个新标签，不采信编号，改为按地址确认`,'observed');
   else log('点击回执未给出唯一新标签，改用地址确认详情页','observed');
   if(!addressDiscovery)throw Object.assign(Error(`点击回执未给出唯一新标签，且标签清单不可用（${listError}）；未重复点击（${describeTrace(trace)}）`),{code:'DETAIL_DISCOVERY_UNAVAILABLE',steps:[...trace]});
   const started=Date.now();
   const discovery=await discoverDetailTabByAddress({listTabs:listExisting,before,deadline:Date.now()+timings.discoveryMs,timings,check,trace,onStep:description=>log(description,'observed')});
   if(discovery.ambiguous)throw Error(`点击后同时出现 ${discovery.ambiguous.length} 个详情页，无法确认本次点击对应哪一个；未重复点击`);
   if(!discovery.found)throw Object.assign(Error(`点击后 ${Math.round(timings.discoveryMs/1000)} 秒内未出现详情页；未重复点击（${describeTrace(trace)}）`),{code:'DETAIL_TAB_NOT_CONFIRMED',steps:[...trace]});
   const {tabId,url,resumeId}=discovery.found;
   if(typeof client.adoptTab!=='function')throw Object.assign(Error(`点击后已按地址看到详情页 ${tabId}，但当前运行时不允许接管该标签；未读取正文（${describeTrace(trace)}）`),{code:'ADAPTER_ADOPT_UNAVAILABLE',discovered:{tabId,url,resumeId},steps:[...trace]});
   children=[{id:tabId,handle:await client.adoptTab(tabId,url),owned:true}];method='observed-card-address-adopt';
   log(`按地址确认详情页 ${tabId}，用时 ${Date.now()-started}ms（${describeTrace(trace)}）`,'observed');
  },
  children:async()=>{
   check();const result=[];
   for(const child of children){const url=await child.handle.url();check();if(url==='about:blank')continue;result.push({page:child.id,url});}
   return result;
  },
  read:async child=>{
   check();const owned=children.find(entry=>entry.id===child.page);if(!owned)throw Error('详情不属于本次点击');
   const url=assertLiepinUrl(await owned.handle.url(),DETAIL_PATH);
   if(url.href!==new URL(child.url).href)throw Error('详情地址已变化');
   return readExpanded?readExpanded(owned.handle,url.searchParams.get('res_id_encode')):readExpandedDetail(createPageFacade(owned.handle,{signal,onAction}),url.searchParams.get('res_id_encode'));
  },
  returnToList:async()=>{
   await closeChildren();check();log('切换回原搜索标签','dispatching');await parent.activate();check();
   if(await parent.url()!==expectedUrl)throw Error('原搜索页地址已变化');
   log('切回搜索标签的指令已返回，回读地址与原搜索页一致；未单独核对活动状态','observed');
  },
  close:closeChildren,
 };
}
export function readMcpDetail(client,{file,operation_id,tab_id,observation_id},{signal,onAction}={}){
 return openListDetail({file,operationId:operation_id,page:tab_id,observationId:observation_id,returnToList:true},{
  validatePage,execute:(file,request,work)=>executeMcpOperation(file,request,work,{signal}),
  openDriver:id=>openMcpDetailDriver(client,id,{signal,onAction}),
 });
}
export async function detailBatch(client,{file,id,tab_id,observation_ids,interval_ms},{signal,onAction}={}){
 if(observation_ids)return createDetailBatch(file,{id,page:tab_id,observationIds:observation_ids},{validatePage});
 return runDetailBatch({file,id,intervalMs:interval_ms??3000},{readDetail:args=>readMcpDetail(client,{file:args.file,operation_id:args.operationId,tab_id:args.page,observation_id:args.observationId},{signal,onAction})});
}

export async function currentDetail(client,{file,operation_id,tab_id,resume_id,expand=false},{signal,onAction=()=>{}}={}){
 const {readCurrentDetail}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/current-detail.js');
 const {inspectDetail}=await import('../../../distribution/liepin-search/runtime/packages/liepin/lib/detail.js');
 return readCurrentDetail({file,operationId:operation_id,page:tab_id,resumeId:resume_id,expand},{
  validatePage,execute:(file,request,work)=>executeMcpOperation(file,request,work,{signal}),
  openReader:async(id,{expand,resumeId})=>{
   if(signal?.aborted)throw Error('操作已取消');
   await client.verify();const tab=client.tab(id);
   const url=assertLiepinUrl(await tab.url(),'/resume/showresumedetail/'),ids=url.searchParams.getAll('res_id_encode');
   if(ids.length!==1||ids[0]!==resumeId)throw Error('当前详情与授权简历身份不符');
   const page=createPageFacade(tab,{signal,onAction});
   return {read:()=>{
    onAction({at:new Date().toISOString(),phase:'reading',description:expand?'读取当前详情并展开已识别的经历区块':'读取当前详情可见内容，不点击或移动鼠标'});
    return expand?readExpandedDetail(page,resumeId):page.evaluate(inspectDetail);
   },close:async()=>{}}; // Existing user tab is never owned or closed by this reader.
  },
 });
}
