import {reviewListTarget} from './visible-reading.mjs';
import {inspectSavedCard,inspectDetailClickTarget,openListDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/open-list-detail.js';
import {readExpandedDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/expanded-detail.js';
import {createDetailBatch,runDetailBatch} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail-batch.js';
import {executeMcpOperation} from './execution.mjs';
import {createPageFacade,assertLiepinUrl} from './transport.mjs';
const validatePage=page=>typeof page==='string'&&/^\d+$/.test(page)&&Number.isSafeInteger(Number(page));
/** Follow only children returned by the single observed click, never arbitrary tabs. */
export async function openMcpDetailDriver(client,id,{signal,onAction=()=>{},readExpanded,visibleReading=false}={}){
 const check=()=>{if(signal?.aborted)throw Error('操作已取消，已派发效果须核对');};
 check();await client.verify();check();
 const parent=client.tab(id),expectedUrl=await parent.url();assertLiepinUrl(expectedUrl,'/search/getConditionItem');
 const page=createPageFacade(parent,{signal,onAction});let origin,children=[],dispatched=false;
 const log=(description,phase)=>onAction({at:new Date().toISOString(),description,phase});
 const closeChildren=async()=>{
  for(const child of [...children]){log('关闭本次打开的详情标签','dispatching');await child.close();children=children.filter(c=>c!==child);log('详情标签关闭指令已返回；未单独回读标签列表','returned');}
 };
 return {
  method:'observed-card-mcp-child',
  check:async row=>{const state=await page.evaluate(inspectSavedCard,{...row,includeOrigin:true});origin=state.openerTimeOrigin;return state.matched&&Number.isFinite(origin);},
  click:async row=>{
   if(dispatched)throw Error('详情入口已经派发，不重复点击');
   if(visibleReading)await reviewListTarget(parent,row.cardSelector,{signal,onAction});
   const selector=await page.evaluate(inspectDetailClickTarget,{detailTarget:row.detailTarget});if(!selector)throw Error('未确认姓名文字入口');
   const state=await page.evaluate(inspectSavedCard,{...row,includeOrigin:true});
   if(!state.matched||state.openerTimeOrigin!==origin)throw Error('搜索文档或列表卡片已变化');
   check();log('点击已核对卡片的姓名文字','dispatching');dispatched=true;
   // Capture returned child ownership before observing cancellation so cleanup remains possible.
   const result=await parent.act({action:'click',target:{selector}});
   const ids=(result.openedTabs??[]).map(tab=>String(tab.tab??tab.tabId));
   if(ids.length!==1||!validatePage(ids[0])||ids[0]===id)throw Error('未确认唯一新详情标签，不重复点击');
   children=[client.claimOpenedTab(ids[0])];check();
  },
  children:async()=>{
   check();const result=[];
   for(const child of children){const url=await child.url();check();if(url==='about:blank')continue;result.push({page:child.id,url});}
   return result;
  },
  read:async child=>{
   check();const owned=children.find(t=>t.id===child.page);if(!owned)throw Error('详情不属于本次点击');
   const url=assertLiepinUrl(await owned.url(),'/resume/showresumedetail/');
   if(url.href!==new URL(child.url).href)throw Error('详情地址已变化');
   return readExpanded?readExpanded(owned,url.searchParams.get('res_id_encode')):readExpandedDetail(createPageFacade(owned,{signal,onAction}),url.searchParams.get('res_id_encode'));
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
