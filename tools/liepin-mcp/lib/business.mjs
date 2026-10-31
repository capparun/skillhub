/** Transport bindings only: business transitions stay in the shared Liepin core. */
import {prepareFilters} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/prepare-task.js';
import {savedSearchTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/saved-search-task.js';
import {setFavorite,inspectFavorite} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/favorite.js';
import {readFavorites,inspectFavorites,readFavoritesView} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/favorites-list.js';
import {createNativeActionSequence,inspectActionTarget} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/native-actions.js';
import {updateTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {executeMcpOperation} from './execution.mjs';
import {createMcpSearchDriver,createPageFacade,assertLiepinUrl} from './transport.mjs';
import {logger} from './workflow.mjs';
const validatePage=page=>typeof page==='string'&&/^\d+$/.test(page);
function options(client,file,signal,context={}){
 const onAction=logger(file,context);
 const bind=async(id,path)=>{
  if(signal?.aborted)throw Error('操作已取消');
  await client.verify();const tab=client.tab(id),expectedUrl=await tab.url();assertLiepinUrl(expectedUrl,path);
  return {tab,expectedUrl};
 };
 return {
  validatePage,execute:(file,request,work)=>executeMcpOperation(file,request,work,{signal}),
  openDriver:async id=>{
   const {tab,expectedUrl}=await bind(id,'/search/getConditionItem');
   // Releasing a driver does not close the user's bound page.
   return {...createMcpSearchDriver(tab,{expectedUrl,signal,onAction}),close:async()=>{}};
  },bind,onAction,
 };
}
export function prepare(client,{file,operation_id,tab_id,filters},{signal}={}){
 return prepareFilters({...filters,file,operationId:operation_id,page:tab_id},options(client,file,signal,{operationId:operation_id,tabId:tab_id}));
}
export async function savedSearch(client,{file,operation_id,tab_id,action,name,current,filters,limit},{signal}={}){
 const result=await savedSearchTask(action,{...filters,file,operationId:operation_id,page:tab_id,name,current,limit},options(client,file,signal,{operationId:operation_id,tabId:tab_id}));
 if(action==='apply'&&result.rows)updateTask(file,t=>({...t,mcpSearch:{tabId:tab_id,operationId:`saved-search-${operation_id}`,rows:result.rows}}));
 return result;
}
export function favorite(client,{file,operation_id,tab_id,action,resume_id,group},{signal}={}){
 const deps=options(client,file,signal,{operationId:operation_id,tabId:tab_id});
 return setFavorite({file,operationId:operation_id,page:tab_id,action,resumeId:resume_id,group},{...deps,openDriver:async(id,resumeId)=>{
  const {tab,expectedUrl}=await deps.bind(id,'/resume/showresumedetail/');
  const ids=new URL(expectedUrl).searchParams.getAll('res_id_encode');
  if(ids.length!==1||ids[0]!==resumeId)throw Error('当前详情与指定简历不符');
  const page=createPageFacade(tab,{signal,onAction:deps.onAction});
  const actions=createNativeActionSequence(page,{expectedUrl,inspectTarget:inspectActionTarget,onAction:deps.onAction});let sequence=0;
  return {inspect:async group=>{
   deps.onAction({phase:'reading',description:'读取收藏按钮与弹层状态，不点击或移动鼠标'});
   const state=await page.evaluate(inspectFavorite,{resumeId,group});
   if(!state.blocked&&state.known)deps.onAction({phase:'observed',description:`回读收藏状态：${state.saved?'已收藏':'未收藏'}${state.addDialog?'，收藏设置弹层已打开':state.removeDialog?'，取消收藏确认弹层已打开':''}`});
   return state;
  },click:(selector,label)=>actions.click({actionId:`favorite-${++sequence}`,selector,label}),close:async()=>{}};
 }});
}
export function favorites(client,{file,operation_id,tab_id,limit,group,workspace,after_operation_id},{signal,openWorkspace}={}){
 const deps=options(client,file,signal,{operationId:operation_id,tabId:tab_id});
 return readFavorites({file,operationId:operation_id,page:tab_id,limit,group,workspace,afterOperationId:after_operation_id},{...deps,openDriver:async id=>{
  let owned;
  if(workspace===true){
   if(typeof openWorkspace!=='function')throw Error('收藏工作页接口不可用');
   owned=await openWorkspace();
  }
  let tab,expectedUrl;
  try{
   if(owned){tab=owned.tab;expectedUrl=await tab.url();assertLiepinUrl(expectedUrl,'/resumemanage/showmytalentlist');deps.onAction=logger(file,{operationId:operation_id,tabId:String(tab.id)});}
   else({tab,expectedUrl}=await deps.bind(id,'/resumemanage/showmytalentlist'));
  }catch(error){if(owned)await owned.close();throw error;}
  const page=createPageFacade(tab,{signal,onAction:deps.onAction});
  let actions,sequence=0;
  return {read:(limit,group)=>{
   deps.onAction({at:new Date().toISOString(),phase:'reading',description:'读取当前收藏列表，不点击或移动鼠标'});
   return readFavoritesView(page,limit,{group,click:(selector,label='我的收藏')=>{actions??=createNativeActionSequence(page,{expectedUrl,inspectTarget:inspectActionTarget,onAction:deps.onAction});return actions.click({actionId:`favorites-navigation-${++sequence}`,selector,label});}});
  },close:async()=>{if(owned)await owned.close();}};
 }});
}
