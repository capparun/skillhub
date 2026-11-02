import {createFavoriteGroup,inspectFavoriteGroup} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/favorite-group.js';
import {preflightOperationBudget} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js';
import {requestFingerprint,isVerifiedRetry} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js';
import {inspectSavedCard} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/open-list-detail.js';
import {readTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {detailTargets} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail-targets.js';
import {sourcingProgress} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/sourcing-outcome.js';
import {setFavorite} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/favorite.js';
import {openMcpDetailDriver} from './detail-driver.mjs';
import {adapterDetailClient} from './site-adapter-open-detail.mjs';
import {adapterFavoriteDriver} from './site-adapter-favorite.mjs';
import {executeMcpOperation} from './execution.mjs';
import {cleanupAdapterChildren} from './site-adapter-cleanup.mjs';
import {logger} from './workflow.mjs';
export function favoriteListTarget(task,args){
 const record=detailTargets(task).find(o=>o.id===args.observation_id);
 if(!record?.candidateKey||!record.hasDetail)throw Error('收藏前需已有详情及稳定身份关联');
 if(args.action==='remove'){
  if(!task.operations?.some(o=>o.kind==='favorite'&&o.status==='completed'&&o.payload?.resumeId===record.candidateKey.slice(7)&&o.payload?.group===args.group&&o.evidence?.saved===true&&o.evidence?.changed===true))throw Error('仅允许取消本任务已确认新增的收藏');
  return record;
 }
 const item=sourcingProgress(task).people.find(p=>p.candidateKey===record.candidateKey);
 if(item?.decision?.decision!=='follow_up'||item.decision.group!==args.group)throw Error('需要当前标准下、指定组的有效跟进依据');
 return record;
}
/** Two separately journaled operations, one current invocation owns the child. */
export async function favoriteFromList(context,{execute=executeMcpOperation,openDriver=openMcpDetailDriver,favorite=setFavorite}={}){
 const {args,signal,tabs}=context,task=readTask(args.file),record=favoriteListTarget(task,args);
 const action=args.action??'add';if(!['add','remove'].includes(action))throw Error('收藏动作无效');
 if(action==='remove'&&args.create_group===true)throw Error('取消收藏不能创建分组');
 const kind=action==='remove'?'unfavorite':'favorite';
 if(args.verify_only===true)return {inspection:await context.tab.evaluate(inspectSavedCard,{arg:{...record.data,includeOrigin:true,diagnostic:true}}),observationId:record.id,mutated:false};
 const writeRequest={operationId:args.operation_id,kind,payload:{observationId:record.id,observationHash:record.hash,page:args.tab_id,resumeId:record.candidateKey.slice(7),action,group:args.group}};
 const previous=task.operations?.find(o=>o.operationId===args.operation_id);
 // Completed writes return their durable receipt without opening a page again.
 if(previous?.status==='completed'){
  return execute(args.file,{operationId:args.operation_id,kind,payload:{observationId:record.id,observationHash:record.hash,page:args.tab_id,resumeId:record.candidateKey.slice(7),action,group:args.group}},async()=>{throw Error('已完成操作不得重放');},{signal});
 }
 if(previous)throw Error('收藏已有未确认或中止记录，先核对，不重新打开详情');
 const writeHash=requestFingerprint(writeRequest);
 if(!task.policy?.requestHashes.includes(writeHash))throw Error('收藏请求尚未获得精确授权，未打开详情');
 if(task.operations.some(o=>o.fingerprint===writeHash)&&!isVerifiedRetry(task,args.operation_id,writeHash))throw Error('收藏已有同一请求，先核对或使用原回执，未打开详情');
 if(args.create_group===true&&(!args.group_operation_id||!task.policy.requestHashes.includes(requestFingerprint({kind:'favorite-group-create',payload:{name:args.group,parent:'我的收藏'}}))))throw Error('创建分组尚未获得精确授权，未打开详情');
 preflightOperationBudget(args.file,args.create_group===true?3:2);
 const resumeId=record.candidateKey.slice(7),client=adapterDetailClient(context),onAction=logger(args.file,{operationId:args.operation_id,tabId:args.tab_id});
 let driver;
 try{
  const opened=await execute(args.file,{operationId:args.open_operation_id,kind:'favorite-open',payload:{observationId:record.id,observationHash:record.hash,page:args.tab_id,purpose:'favorite',favoriteOperationId:args.operation_id,...(args.create_group===true?{groupOperationId:args.group_operation_id}:{})}},async()=>{
   driver=await openDriver(client,args.tab_id,{signal,onAction});
   if(!await driver.check(record.data))return {status:'blocked',evidence:{reason:'saved_card_changed'}};
   await driver.click(record.data);
   let children=[];
   for(let i=0;i<20;i++){children=await driver.children();if(children.length)break;await new Promise(r=>setTimeout(r,200));}
   if(children.length!==1)return {status:'unknown',evidence:{reason:'favorite_detail_not_unique'}};
   const child=children[0],url=new URL(child.url),ids=url.searchParams.getAll('res_id_encode');
   if(url.origin!=='https://h.liepin.com'||url.pathname!=='/resume/showresumedetail/'||ids.length!==1||ids[0]!==resumeId)return {status:'blocked',evidence:{reason:'favorite_detail_identity_mismatch'}};
   return {status:'completed',evidence:{resumeId,detailPage:child.page,parentPage:args.tab_id}};
  },{signal});
  if(opened.reason)return {status:'blocked',reason:opened.reason,mutated:false};
  if(!driver||opened.resumeId!==resumeId||!tabs.opened().map(String).includes(String(opened.detailPage)))throw Error('当前调用未持有已核实详情；不重开或重放收藏');
  const child=await tabs.child(opened.detailPage);
  if(args.create_group===true){
   if(!args.group_operation_id)throw Error('创建分组需要独立操作ID和授权');
   const groupPayload={name:args.group,parent:'我的收藏'};
   const groupResult=await createFavoriteGroup({file:args.file,operationId:args.group_operation_id,name:args.group,payload:groupPayload},{execute:(file,request,work)=>execute(file,request,work,{signal}),openDriver:async()=>{
    let observed;
    return {inspect:async()=>{if(signal?.aborted)throw Error('创建分组已取消');observed=await child.evaluate(inspectFavoriteGroup,{arg:{resumeId,name:args.group}});return observed;},act:async(action,selector,value)=>{
     if(signal?.aborted||!observed||observed.blocked||![observed.favorite,observed.root,observed.add,observed.input,observed.save].includes(selector))throw Error('分组目标未经当前观察确认');
     if(action==='fill'&&(selector!==observed.input||value!==args.group))throw Error('分组输入与授权不一致');
     const description=action==='hover'?'鼠标移到我的收藏分组行':action==='fill'?'填写分组名称':selector===observed.favorite?'点击收藏按钮':selector===observed.add?'点击我的收藏下的添加子节点':'点击保存新分组';observed=undefined;onAction({phase:'dispatching',description});
     return child.act({action,target:{selector},...(action==='fill'?{value}:{})});
    }};
   }});
   if(groupResult.groupVerified!==true)return {groupResult,favoriteSaved:false};
  }
  // Keep the request bound to the observed parent/observation across child IDs.
  return await favorite({file:args.file,operationId:args.operation_id,page:opened.detailPage,resumeId,action,group:args.group},{
   validatePage:id=>/^\d+$/.test(id),
   execute:(file,request,work)=>execute(file,{...request,payload:{observationId:record.id,observationHash:record.hash,page:args.tab_id,resumeId,action,group:args.group}},work,{signal}),
   openDriver:async()=>adapterFavoriteDriver(child,{resumeId,signal,onAction}),
  });
 }finally{
  try{if(driver)await driver.returnToList();}finally{await cleanupAdapterChildren(tabs,{file:args.file,operationId:args.operation_id,onAction});}
 }
}
