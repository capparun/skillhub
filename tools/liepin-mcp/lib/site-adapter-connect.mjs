import {readTask,updateTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {assertLiepinUrl} from './transport.mjs';
import {executeMcpOperation} from './execution.mjs';
const searchUrl='https://h.liepin.com/search/getConditionItem';
export async function connectAdapterSearch({args,tab,tabs,userTabs,signal}){
 let previous;
 if(args.replaces_operation_id!==undefined){
  const task=readTask(args.file);previous=task.operations?.find(o=>o.operationId===args.replaces_operation_id);
  if(args.new_workspace!==true||previous?.status!=='completed'||previous.kind!=='inspect'||previous.payload?.view!=='adapter-search-connect'||previous.payload?.url!==searchUrl||previous.payload?.newWorkspace!==true||!/^\d+$/.test(previous.evidence?.tabId??''))throw Error('只能替代本任务已完成创建的独立搜索工作页；不恢复未知操作或用户原页面');
 }
 return executeMcpOperation(args.file,{operationId:args.operation_id,kind:'inspect',payload:{view:'adapter-search-connect',url:searchUrl,...(args.new_workspace===true?{newWorkspace:true}:{}),...(previous?{replacesOperationId:previous.operationId}:{})}},async({check})=>{
  check();
  let absence;
  if(previous){
   if(typeof userTabs?.lookup!=='function')throw Error('当前宿主不能独立核对旧工作页是否关闭');
   absence=await userTabs.lookup(previous.evidence.tabId);check();
   if(absence?.tabId!==previous.evidence.tabId||typeof absence.exists!=='boolean')throw Error('旧工作页存在性核对结果无效');
   if(absence.exists!==false||absence.verification!=='chrome-tabs-get-not-found')return {status:'blocked',evidence:{reason:'previous_workspace_still_exists',workspaceCreated:false}};
   updateTask(args.file,task=>{task.events.push({operationId:args.operation_id,phase:'observed',description:'已用浏览器标签元数据确认原工作标签不存在；未读取或修改其他页面',at:new Date().toISOString()});return task;});
  }
  // Navigation is intentional and authorized; never use this as blank-page recovery.
  updateTask(args.file,task=>{task.events.push({type:'browser_action',operationId:args.operation_id,phase:'dispatching',description:args.new_workspace===true?'在新标签打开猎聘搜索页，保留原页面':'在官方Adapter会话中打开猎聘搜索页',at:new Date().toISOString()});return task;});
  let target=tab;
  if(args.new_workspace===true){
   if(typeof tabs?.openSearch!=='function')throw Error('当前宿主不支持新建搜索工作页');
   target=await tabs.openSearch();
  }else await target.goto(searchUrl,{waitUntil:'load'});
  check();
  const url=await target.url();check();assertLiepinUrl(url,'/search/getConditionItem');
  const tabId=String(target.id);
  if(!/^\d+$/.test(tabId)||!Number.isSafeInteger(Number(tabId)))throw Error('官方搜索会话未返回有效标签ID');
  return {status:'completed',evidence:{tabId,url,session:'site:liepin',verification:'url-only',note:'仅核对页面地址，登录与搜索控件仍需实际观察',...(previous?{replacesOperationId:previous.operationId,previousTabId:previous.evidence.tabId,absence}:{} )}};
 },{signal});
}
