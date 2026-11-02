import {logger} from './workflow.mjs';
import {boundContext} from './site-adapter-search.mjs';
import {coreFilters} from './site-adapter-filters.mjs';
import {savedSearch,favorites} from './business.mjs';
export async function adapterSavedSearch(context){
 const client=boundContext(context);
 const result=await savedSearch(client,{...context.args,filters:context.args.filters?coreFilters(context.args.filters):undefined},{signal:context.signal});
 // Apply returns rows plus scheme metadata; retain all fields as a single value.
 return {snapshot:result};
}
export async function adapterFavorites(context){
 // Keep totals and snapshot metadata: official rows normalization drops extra fields.
 const {args,tabs,signal}=context;
 const client=boundContext(context);
 const onAction=logger(args.file,{operationId:args.operation_id,tabId:args.tab_id});
 const snapshot=await favorites(client,args,{signal,openWorkspace:async()=>{
  if(typeof tabs?.openFavorites!=='function')throw Error('当前宿主尚未支持独立收藏工作页');
  onAction({phase:'dispatching',description:'在新标签打开猎聘人才管理页，保留原搜索页'});
  const priorOwned=new Set(tabs.opened().map(String));
  let child;
  try{child=await tabs.openFavorites();}
  catch(error){for(const id of tabs.opened())if(!priorOwned.has(String(id)))await tabs.closeChild(id);await tabs.returnToParent();throw error;}
  onAction({phase:'observed',description:'已创建人才管理标签；收藏列表仍待读取'});
  return {tab:child,close:async()=>{
   onAction({phase:'dispatching',description:'关闭本次创建的人才管理标签，返回原页面'});
   await tabs.closeChild(String(child.id));await tabs.returnToParent();
   onAction({phase:'observed',description:'本次人才管理标签已关闭，已返回原页面'});
  }};
 }});
 return {snapshot};
}
