import {parseDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail.js';
import {readTask,updateTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {reviewVisibleDetail} from './visible-reading.mjs';
import {cleanupAdapterChildren} from './site-adapter-cleanup.mjs';
import {openListDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/open-list-detail.js';
import {openMcpDetailDriver} from './detail-driver.mjs';
import {readAdapterExpandedDetail} from './site-adapter-expansion.mjs';
import {boundContext} from './site-adapter-search.mjs';
import {executeMcpOperation} from './execution.mjs';
import {logger} from './workflow.mjs';
export function adapterDetailClient(context){
 const base=boundContext(context),{tabs,tab}=context;
 if(!tabs?.child||!tabs?.closeChild||!tabs?.returnToParent||!tabs?.opened)throw Error('当前官方运行时缺少同会话标签接口；请使用已验证的兼容构建');
 const child=id=>({id,url:async()=>(await tabs.child(id)).url(),evaluate:async(...args)=>(await tabs.child(id)).evaluate(...args),act:async(...args)=>(await tabs.child(id)).act(...args),close:()=>tabs.closeChild(id)});
 const userTabs=context.userTabs;
 return {...base,tab:id=>{base.tab(id);return {id:String(tab.id),url:()=>tab.url(),evaluate:(...a)=>tab.evaluate(...a),act:a=>tab.act(a),activate:()=>tabs.returnToParent()};},claimOpenedTab:child,
  // Address-first recovery: list this site's tabs, then adopt one whose address proved it is the detail page.
  userTabs:async()=>{if(typeof userTabs?.list!=='function')throw Error('当前运行时缺少标签清单接口；无法按地址确认详情页');return userTabs.list();},
  adoptTab:typeof context.adoptTab!=='function'?undefined:async(id,expectedUrl)=>{
   const handle=await context.adoptTab(String(id),expectedUrl);
   if(String(handle?.id)!==String(id))throw Error('认领详情标签的结果身份不一致');
   return child(String(id));
  }};
}
/** Readiness polling must not repeat the visible review or wait on loading content. */
export function createReviewedDetailReader({read,review,onAction=()=>{}}){
 const reviewed=new Set();
 return async(tab,resumeId)=>{
  const started=Date.now(),result=await read(tab,resumeId),readMs=Date.now()-started;let visibleCheckMs=0;
  if(!reviewed.has(resumeId)&&['readable','partial'].includes(parseDetail(result,resumeId).status)){
   const reviewStarted=Date.now(),checked=await review(tab,resumeId);visibleCheckMs=Date.now()-reviewStarted;reviewed.add(resumeId);
   onAction({phase:'observed',description:`详情可见阅读完成 ${checked.views.length} 屏；${checked.atEnd?'已到页面底部':'仍有后续栏目未逐屏核对'}`,readingReview:checked});
  }
  onAction({phase:'observed',description:`详情采集 ${readMs} 毫秒，栏目位置核对 ${visibleCheckMs} 毫秒；不计作人工阅读速度`,detailPerformance:{readMs,visibleCheckMs,totalMs:Date.now()-started,fixedWaitMs:0}});
  return result;
 };
}
export async function openAdapterDetail(context){
 const client=adapterDetailClient(context),{args,signal}=context,onAction=logger(args.file,{operationId:args.operation_id,tabId:args.tab_id});
 const visibleReading=readTask(args.file).executionPreferences?.readingMode==='content-led-visible-review';
 const readExpanded=visibleReading?createReviewedDetailReader({
  read:(tab,resumeId)=>readAdapterExpandedDetail(tab,resumeId,{signal,onAction}),
  review:(tab,resumeId)=>reviewVisibleDetail(tab,resumeId,{signal,onAction}),onAction,
 }):(tab,resumeId)=>readAdapterExpandedDetail(tab,resumeId,{signal,onAction});
 const keep=args.keep_open===true;let driver;
 if(keep){if(!context.tabs?.retainReview||!context.tabs?.reviewAvailable)throw Error('需要支持详情审阅的兼容运行时');context.tabs.reviewAvailable();}
 try{const evidence=await openListDetail({file:args.file,operationId:args.operation_id,page:args.tab_id,observationId:args.observation_id,returnToList:!keep},{
  validatePage:page=>typeof page==='string'&&/^\d+$/.test(page)&&Number.isSafeInteger(Number(page)),
  execute:(file,request,work)=>executeMcpOperation(file,request,work,{signal}),
  openDriver:async id=>{
   driver=await openMcpDetailDriver(client,id,{signal,onAction,visibleReading,readExpanded});
   return keep?new Proxy(driver,{get:(target,key)=>key==='close'?async()=>{}:Reflect.get(target,key,target)}):driver;
  },
 });
 if(keep&&evidence.detail&&['readable','partial'].includes(evidence.detail.status)){
  if(!driver)throw Error('当前调用没有新详情，不从历史回执恢复关闭权限');
  const review=await context.tabs.retainReview(evidence.detailPage,args.file);
  try{updateTask(args.file,task=>{task.detailReviews??=[];task.detailReviews.push({...review,parentTab:args.tab_id,observationId:args.observation_id,readOperationId:args.operation_id,status:'open',at:new Date().toISOString()});return task;});}
  catch(error){await context.detailReviews.finish(review.token,{file:args.file,parent:args.tab_id});throw error;}
  onAction({phase:'observed',description:'保留本次详情页，等待基于已保存资料完成评估；未收藏'});
  return {...evidence,review};
 }
 return evidence;
 }finally{
  // The runtime captures ownership before the deadline wrapper can throw.
  // Cleanup uses only those captured children, including cancellation after click.
  await cleanupAdapterChildren(context.tabs,{file:args.file,operationId:args.operation_id,onAction});
 }
}
